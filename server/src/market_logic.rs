use spacetimedb::{ReducerContext, Table};

use crate::sim_math::{gbm_step, ReplayRng};
use crate::{
    market_asset, market_news, market_tick_schedule, owned_vehicle, player, portfolio,
    vehicle_catalog, MarketAsset, MarketNews, MarketTickSchedule, OwnedVehicle, Portfolio,
    VehicleCatalog,
};

const STARTING_CASH: f64 = 100_000.0;
const TICK_SECONDS: f64 = 2.0;
const TRADING_DAYS_PER_YEAR: f64 = 252.0;
const SECONDS_PER_TRADING_DAY: f64 = 6.5 * 3600.0;

pub fn seed_market_assets(ctx: &ReducerContext) {
    if ctx.db.market_asset().count() > 0 {
        return;
    }

    let assets = [
        ("AAPL", "Apple Inc.", 185.0, 0.22, 0.08),
        ("GOOG", "Alphabet Inc.", 142.0, 0.25, 0.09),
        ("MSFT", "Microsoft Corp.", 410.0, 0.20, 0.07),
        ("TSLA", "Tesla Inc.", 245.0, 0.45, 0.12),
        ("NVDA", "NVIDIA Corp.", 875.0, 0.38, 0.15),
        ("JPM", "JPMorgan Chase", 198.0, 0.18, 0.05),
        ("V", "Visa Inc.", 278.0, 0.16, 0.06),
        ("BTC", "Crypto Index", 62_000.0, 0.55, 0.10),
    ];

    for (ticker, name, price, vol, drift) in assets {
        ctx.db.market_asset().insert(MarketAsset {
            ticker: ticker.to_string(),
            company_name: name.to_string(),
            current_price: price,
            previous_price: price,
            volatility: vol,
            drift,
        });
    }
}

pub fn seed_vehicle_catalog(ctx: &ReducerContext) {
    if ctx.db.vehicle_catalog().count() > 0 {
        return;
    }

    let vehicles = [
        ("Sports Coupe", "coupe", 25_000.0),
        ("Luxury Sedan", "sedan", 55_000.0),
        ("Supercar", "supercar", 150_000.0),
        ("Yacht", "yacht", 500_000.0),
    ];

    for (name, model_key, price) in vehicles {
        ctx.db.vehicle_catalog().insert(VehicleCatalog {
            vehicle_key: model_key.to_string(),
            display_name: name.to_string(),
            price,
            model_url: format!("/models/{}.glb", model_key),
        });
    }
}

pub fn repair_market_prices(ctx: &ReducerContext) {
    let defaults: [(&str, f64); 8] = [
        ("AAPL", 185.0),
        ("GOOG", 142.0),
        ("MSFT", 410.0),
        ("TSLA", 245.0),
        ("NVDA", 875.0),
        ("JPM", 198.0),
        ("V", 278.0),
        ("BTC", 62_000.0),
    ];

    for mut asset in ctx.db.market_asset().iter() {
        if let Some((_, price)) = defaults.iter().find(|(t, _)| *t == asset.ticker.as_str()) {
            if asset.current_price > price * 5.0 || asset.current_price < price * 0.2 {
                asset.current_price = *price;
                asset.previous_price = *price;
                ctx.db.market_asset().ticker().update(asset);
            }
        }
    }
}

/// Baseline volatility per ticker (matches the seed values). Used to gently
/// mean-revert volatility after an AI market shock so the market calms down.
fn base_volatility(ticker: &str) -> f64 {
    match ticker {
        "AAPL" => 0.22,
        "GOOG" => 0.25,
        "MSFT" => 0.20,
        "TSLA" => 0.45,
        "NVDA" => 0.38,
        "JPM" => 0.18,
        "V" => 0.16,
        "BTC" => 0.55,
        _ => 0.25,
    }
}

pub fn process_market_tick(ctx: &ReducerContext, seed: u64) {
    let dt = TICK_SECONDS / (TRADING_DAYS_PER_YEAR * SECONDS_PER_TRADING_DAY);
    let mut rng = ReplayRng::seed(seed);

    for mut asset in ctx.db.market_asset().iter() {
        // Mean-revert volatility toward its baseline so post-shock turbulence decays.
        let base_vol = base_volatility(&asset.ticker);
        asset.volatility += (base_vol - asset.volatility) * 0.05;

        let z = rng.standard_normal();
        asset.previous_price = asset.current_price;
        asset.current_price = gbm_step(asset.current_price, asset.drift, asset.volatility, dt, z);

        ctx.db.market_asset().ticker().update(asset);
    }
}

/// Record an AI-generated headline into the public news feed (kept to 12 rows).
fn push_news(ctx: &ReducerContext, headline: String, sentiment: i32) {
    ctx.db.market_news().insert(MarketNews {
        news_id: 0,
        headline,
        sentiment: sentiment.clamp(-10, 10),
        created_at: ctx.timestamp,
    });

    let mut ids: Vec<u64> = ctx.db.market_news().iter().map(|n| n.news_id).collect();
    ids.sort_unstable();
    let excess = ids.len().saturating_sub(12);
    for id in ids.into_iter().take(excess) {
        ctx.db.market_news().news_id().delete(id);
    }
}

/// Record an AI-generated headline and violently swing the market in the
/// direction (and magnitude) of its sentiment score (-10 crash .. +10 rally).
pub fn apply_market_shock(ctx: &ReducerContext, headline: String, sentiment: i32) {
    let s = sentiment.clamp(-10, 10);

    push_news(ctx, headline, s);

    // Instant directional price jolt (up to ~6%) plus per-asset noise.
    let directional = (s as f64 / 10.0) * 0.06;
    let vol_spike = (s.unsigned_abs() as f64 / 10.0) * 0.35;
    let mut rng = ReplayRng::seed((s.unsigned_abs() as u64).wrapping_add(7).wrapping_mul(0xA5A5));

    for mut asset in ctx.db.market_asset().iter() {
        let noise = (rng.uniform01() - 0.5) * 0.04;
        let factor = (1.0 + directional + noise).max(0.5);

        asset.previous_price = asset.current_price;
        asset.current_price = (asset.current_price * factor).max(0.01);
        asset.volatility = (asset.volatility + vol_spike).min(0.95);

        ctx.db.market_asset().ticker().update(asset);
    }
}

/// Prompt-to-game "Remix" engine. An AI parses a player's natural-language
/// prompt into structured market parameters; this reducer applies them to the
/// live simulation. `ticker` may be a specific symbol or "ALL". `drift_modifier`
/// nudges the asset's long-run trend AND jolts price immediately;
/// `volatility_modifier` raises turbulence (it mean-reverts over time).
pub fn remix_market(
    ctx: &ReducerContext,
    ticker: String,
    drift_modifier: f64,
    volatility_modifier: f64,
    headline: String,
) {
    let drift_mod = drift_modifier.clamp(-0.5, 0.5);
    let vol_mod = volatility_modifier.clamp(-0.5, 0.8);
    let sentiment = (drift_mod * 50.0).clamp(-10.0, 10.0) as i32;

    if !headline.trim().is_empty() {
        push_news(ctx, headline, sentiment);
    }

    // Immediate price jolt proportional to drift (capped at ±25%).
    let price_jolt = 1.0 + drift_mod.clamp(-0.25, 0.25);

    let target = ticker.trim().to_uppercase();
    let apply_to_all = target.is_empty() || target == "ALL" || target == "MARKET";

    let assets: Vec<MarketAsset> = if apply_to_all {
        ctx.db.market_asset().iter().collect()
    } else {
        ctx.db
            .market_asset()
            .ticker()
            .find(&target)
            .into_iter()
            .collect()
    };

    for mut asset in assets {
        asset.drift = (asset.drift + drift_mod).clamp(-0.6, 0.8);
        asset.volatility = (asset.volatility + vol_mod).clamp(0.05, 0.95);
        asset.previous_price = asset.current_price;
        asset.current_price = (asset.current_price * price_jolt).max(0.01);
        ctx.db.market_asset().ticker().update(asset);
    }
}

pub fn execute_buy(
    ctx: &ReducerContext,
    ticker: String,
    shares: f64,
) -> Result<(), String> {
    if shares <= 0.0 {
        return Err("Share quantity must be positive".to_string());
    }

    let sender = ctx.sender();
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    let asset = ctx
        .db
        .market_asset()
        .ticker()
        .find(&ticker)
        .ok_or("Asset not found")?;

    let total_cost = asset.current_price * shares;
    if player.cash_balance < total_cost {
        return Err(format!(
            "Insufficient funds: need ${:.2}, have ${:.2}",
            total_cost, player.cash_balance
        ));
    }

    player.cash_balance -= total_cost;
    ctx.db.player().identity().update(player);

    if let Some(mut position) = find_position(ctx, sender, &ticker) {
        let total_shares = position.shares + shares;
        position.average_entry_price = ((position.average_entry_price * position.shares)
            + (asset.current_price * shares))
            / total_shares;
        position.shares = total_shares;
        ctx.db.portfolio().position_id().update(position);
    } else {
        ctx.db.portfolio().insert(Portfolio {
            position_id: 0,
            owner_identity: sender,
            ticker,
            shares,
            average_entry_price: asset.current_price,
        });
    }

    Ok(())
}

pub fn execute_sell(
    ctx: &ReducerContext,
    ticker: String,
    shares: f64,
) -> Result<(), String> {
    if shares <= 0.0 {
        return Err("Share quantity must be positive".to_string());
    }

    let sender = ctx.sender();
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    let mut position = find_position(ctx, sender, &ticker).ok_or("Position not found")?;

    if position.shares < shares {
        return Err("Insufficient shares".to_string());
    }

    let asset = ctx
        .db
        .market_asset()
        .ticker()
        .find(&ticker)
        .ok_or("Asset not found")?;

    let proceeds = asset.current_price * shares;
    player.cash_balance += proceeds;
    ctx.db.player().identity().update(player);

    position.shares -= shares;
    if position.shares < 0.0001 {
        ctx.db.portfolio().position_id().delete(position.position_id);
    } else {
        ctx.db.portfolio().position_id().update(position);
    }

    Ok(())
}

pub fn buy_vehicle(ctx: &ReducerContext, vehicle_key: String) -> Result<(), String> {
    let sender = ctx.sender();
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    let catalog = ctx
        .db
        .vehicle_catalog()
        .vehicle_key()
        .find(&vehicle_key)
        .ok_or("Vehicle not found")?;

    if player.cash_balance < catalog.price {
        return Err(format!(
            "Insufficient funds: need ${:.0}, have ${:.2}",
            catalog.price, player.cash_balance
        ));
    }

    let spawn_x = player.position.x + 3.0;
    let spawn_z = player.position.z;

    player.cash_balance -= catalog.price;
    ctx.db.player().identity().update(player);

    ctx.db.owned_vehicle().insert(OwnedVehicle {
        vehicle_id: 0,
        owner_identity: sender,
        vehicle_key: catalog.vehicle_key.clone(),
        display_name: catalog.display_name.clone(),
        model_url: catalog.model_url.clone(),
        spawn_x,
        spawn_z,
    });

    Ok(())
}

pub fn upgrade_knowledge(ctx: &ReducerContext) -> Result<(), String> {
    let sender = ctx.sender();
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    if player.knowledge_level >= 3 {
        return Err("Already at max knowledge level".to_string());
    }

    player.knowledge_level += 1;
    ctx.db.player().identity().update(player);
    Ok(())
}

pub fn default_cash() -> f64 {
    STARTING_CASH
}

fn find_position(
    ctx: &ReducerContext,
    owner: spacetimedb::Identity,
    ticker: &str,
) -> Option<Portfolio> {
    ctx.db
        .portfolio()
        .by_owner()
        .filter(owner)
        .find(|position| position.ticker == ticker)
}

pub fn schedule_market_tick(ctx: &ReducerContext) {
    use spacetimedb::ScheduleAt;
    use std::time::Duration;

    if ctx.db.market_tick_schedule().count() == 0 {
        ctx.db.market_tick_schedule().insert(MarketTickSchedule {
            scheduled_id: 0,
            scheduled_at: ScheduleAt::Interval(Duration::from_secs(2).into()),
        });
    }
}
