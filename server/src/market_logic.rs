use spacetimedb::{ReducerContext, Table};

use crate::rules;
use crate::sim_math::{
    gbm_step, next_regime, regime_drift_multiplier, regime_vol_multiplier, Regime, ReplayRng,
};
use crate::{
    market_asset, market_news, market_regime, market_tick_schedule, owned_vehicle, player,
    portfolio, resting_order, vehicle_catalog, MarketAsset, MarketNews, MarketRegime,
    MarketTickSchedule, OwnedVehicle, Portfolio, RestingOrder, VehicleCatalog,
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

/// Seed the single market-regime row (starts calm). Idempotent.
pub fn seed_market_regime(ctx: &ReducerContext) {
    if ctx.db.market_regime().id().find(0).is_none() {
        ctx.db.market_regime().insert(MarketRegime {
            id: 0,
            regime: Regime::Calm.to_u8(),
            ticks_in_regime: 0,
            updated_at: ctx.timestamp,
        });
    }
}

/// Honest headline + sentiment for a regime transition. These are labelled
/// simulation events (server-authoritative), not real news.
fn regime_transition_news(regime: Regime) -> (String, i32) {
    match regime {
        Regime::Calm => (
            "Volatility subsides — the market settles into a calm regime.".to_string(),
            3,
        ),
        Regime::Volatile => (
            "Turbulence builds — the market shifts into a volatile regime.".to_string(),
            -3,
        ),
        Regime::Crisis => (
            "Risk-off crisis regime: volatility spikes and drift turns negative.".to_string(),
            -8,
        ),
    }
}

pub fn process_market_tick(ctx: &ReducerContext, seed: u64) {
    let dt = TICK_SECONDS / (TRADING_DAYS_PER_YEAR * SECONDS_PER_TRADING_DAY);
    let mut rng = ReplayRng::seed(seed);

    // --- Advance the volatility regime once per tick (before per-asset math) ---
    let existing = ctx.db.market_regime().id().find(0);
    let current = existing
        .as_ref()
        .map(|r| Regime::from_u8(r.regime))
        .unwrap_or(Regime::Calm);
    let prev_ticks = existing.as_ref().map(|r| r.ticks_in_regime).unwrap_or(0);

    let next = next_regime(current, rng.uniform01());
    let changed = next != current;

    let regime_row = MarketRegime {
        id: 0,
        regime: next.to_u8(),
        ticks_in_regime: if changed { 0 } else { prev_ticks.saturating_add(1) },
        updated_at: ctx.timestamp,
    };
    if existing.is_some() {
        ctx.db.market_regime().id().update(regime_row);
    } else {
        ctx.db.market_regime().insert(regime_row);
    }
    if changed {
        spacetimedb::log::info!("[MARKET] regime {} -> {}", current.label(), next.label());
        let (headline, sentiment) = regime_transition_news(next);
        push_news(ctx, headline, sentiment);
    }

    // The regime modulates every asset's *effective* drift/vol this tick without
    // permanently altering its stored baseline — so vol clusters while the regime
    // persists, then relaxes when it flips back to calm.
    let vol_mult = regime_vol_multiplier(next);
    let drift_mult = regime_drift_multiplier(next);

    for mut asset in ctx.db.market_asset().iter() {
        // Mean-revert stored volatility toward baseline so post-shock turbulence decays.
        let base_vol = base_volatility(&asset.ticker);
        asset.volatility += (base_vol - asset.volatility) * 0.05;

        let z = rng.standard_normal();
        let eff_vol = (asset.volatility * vol_mult).clamp(0.01, 3.0);
        let eff_drift = asset.drift * drift_mult;

        asset.previous_price = asset.current_price;
        asset.current_price = gbm_step(asset.current_price, eff_drift, eff_vol, dt, z);

        ctx.db.market_asset().ticker().update(asset);
    }

    // Fill any resting limit/stop orders the new prices have crossed.
    process_resting_orders(ctx);
}

/// Record an AI-generated headline into the public news feed (kept to 12 rows).
fn push_news(ctx: &ReducerContext, headline: String, sentiment: i32) {
    ctx.db.market_news().insert(MarketNews {
        news_id: 0,
        headline,
        sentiment: rules::clamp_sentiment(sentiment),
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
    let s = rules::clamp_sentiment(sentiment);

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
        asset.volatility = rules::clamp_asset_volatility(asset.volatility + vol_spike);

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
) -> Result<(), String> {
    let drift_mod = rules::clamp_drift_mod(drift_modifier);
    let vol_mod = rules::clamp_vol_mod(volatility_modifier);
    let sentiment = (drift_mod * 50.0).clamp(-10.0, 10.0) as i32;

    // Immediate price jolt proportional to drift (capped at ±25%).
    let price_jolt = rules::remix_price_jolt(drift_mod);

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

    // A specific ticker that matches nothing is a client mistake: report it
    // rather than silently no-op'ing (the reducer used to return `()`, so the
    // player got no feedback that their prompt named an unknown symbol).
    if assets.is_empty() {
        return Err(format!("Unknown ticker '{}' — no market moved", target));
    }

    if !headline.trim().is_empty() {
        push_news(ctx, headline, sentiment);
    }

    for mut asset in assets {
        asset.drift = rules::clamp_asset_drift(asset.drift + drift_mod);
        asset.volatility = rules::clamp_asset_volatility(asset.volatility + vol_mod);
        asset.previous_price = asset.current_price;
        asset.current_price = (asset.current_price * price_jolt).max(0.01);
        ctx.db.market_asset().ticker().update(asset);
    }

    Ok(())
}

/// Buy `shares` of `ticker` for `owner` at an explicit `price`. Owner-
/// parameterised (not `ctx.sender()`) so both the `execute_trade` reducer and
/// the resting-order fill path (which runs inside the scheduled market tick, a
/// different sender) can share the exact same funds/position accounting.
fn buy_at(
    ctx: &ReducerContext,
    owner: spacetimedb::Identity,
    ticker: &str,
    shares: f64,
    price: f64,
) -> Result<(), String> {
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(owner)
        .ok_or("Player not found")?;

    let total_cost = price * shares;
    if !rules::can_afford(player.cash_balance, total_cost) {
        return Err(format!(
            "Insufficient funds: need ${:.2}, have ${:.2}",
            total_cost, player.cash_balance
        ));
    }

    player.cash_balance -= total_cost;
    ctx.db.player().identity().update(player);

    if let Some(mut position) = find_position(ctx, owner, ticker) {
        position.average_entry_price =
            rules::weighted_average_price(position.shares, position.average_entry_price, shares, price);
        position.shares += shares;
        ctx.db.portfolio().position_id().update(position);
    } else {
        ctx.db.portfolio().insert(Portfolio {
            position_id: 0,
            owner_identity: owner,
            ticker: ticker.to_string(),
            shares,
            average_entry_price: price,
        });
    }

    Ok(())
}

/// Sell `shares` of `ticker` held by `owner` at an explicit `price`. See
/// `buy_at` for why this is owner-parameterised.
fn sell_at(
    ctx: &ReducerContext,
    owner: spacetimedb::Identity,
    ticker: &str,
    shares: f64,
    price: f64,
) -> Result<(), String> {
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(owner)
        .ok_or("Player not found")?;

    let mut position = find_position(ctx, owner, ticker).ok_or("Position not found")?;
    if !rules::can_sell(position.shares, shares) {
        return Err("Insufficient shares".to_string());
    }

    player.cash_balance += price * shares;
    ctx.db.player().identity().update(player);

    position.shares -= shares;
    if rules::is_dust_position(position.shares) {
        ctx.db.portfolio().position_id().delete(position.position_id);
    } else {
        ctx.db.portfolio().position_id().update(position);
    }

    Ok(())
}

pub fn execute_buy(ctx: &ReducerContext, ticker: String, shares: f64) -> Result<(), String> {
    if shares <= 0.0 {
        return Err("Share quantity must be positive".to_string());
    }
    let asset = ctx
        .db
        .market_asset()
        .ticker()
        .find(&ticker)
        .ok_or("Asset not found")?;
    buy_at(ctx, ctx.sender(), &ticker, shares, asset.current_price)
}

pub fn execute_sell(ctx: &ReducerContext, ticker: String, shares: f64) -> Result<(), String> {
    if shares <= 0.0 {
        return Err("Share quantity must be positive".to_string());
    }
    let asset = ctx
        .db
        .market_asset()
        .ticker()
        .find(&ticker)
        .ok_or("Asset not found")?;
    sell_at(ctx, ctx.sender(), &ticker, shares, asset.current_price)
}

/// Place a resting limit or stop order. `is_stop == false` is a limit order.
/// The order rests until a market tick moves the price across its trigger, at
/// which point it fills against the simulated price (see `process_resting_orders`).
pub fn place_order(
    ctx: &ReducerContext,
    ticker: String,
    is_buy: bool,
    is_stop: bool,
    shares: f64,
    trigger_price: f64,
) -> Result<(), String> {
    if shares <= 0.0 {
        return Err("Share quantity must be positive".to_string());
    }
    if !(trigger_price.is_finite() && trigger_price > 0.0) {
        return Err("Trigger price must be positive".to_string());
    }

    let sender = ctx.sender();
    if ctx.db.player().identity().find(sender).is_none() {
        return Err("Player not found".to_string());
    }

    let target = ticker.trim().to_uppercase();
    if ctx.db.market_asset().ticker().find(&target).is_none() {
        return Err(format!("Unknown ticker '{}'", target));
    }

    let open = ctx.db.resting_order().by_owner().filter(sender).count();
    if open >= rules::MAX_RESTING_ORDERS {
        return Err("Too many open orders — cancel some first".to_string());
    }

    ctx.db.resting_order().insert(RestingOrder {
        order_id: 0,
        owner_identity: sender,
        ticker: target,
        is_buy,
        is_stop,
        shares,
        trigger_price,
        created_at: ctx.timestamp,
    });
    Ok(())
}

/// Cancel one of the caller's resting orders.
pub fn cancel_order(ctx: &ReducerContext, order_id: u64) -> Result<(), String> {
    let order = ctx
        .db
        .resting_order()
        .order_id()
        .find(order_id)
        .ok_or("Order not found")?;
    if order.owner_identity != ctx.sender() {
        return Err("Not your order".to_string());
    }
    ctx.db.resting_order().order_id().delete(order_id);
    Ok(())
}

/// After prices move each tick, fill every resting order the new price has
/// crossed. Fills happen at the simulated price (gap-through fills at that
/// price, not the trigger). Orders are all-or-nothing here — partial fills
/// against limited liquidity aren't modelled (there is no order book; see the
/// methodology page). An order that can't fill (e.g. insufficient funds/shares
/// by the time it triggers) is cancelled rather than left resting forever.
pub fn process_resting_orders(ctx: &ReducerContext) {
    let orders: Vec<RestingOrder> = ctx.db.resting_order().iter().collect();
    for order in orders {
        let Some(asset) = ctx.db.market_asset().ticker().find(&order.ticker) else {
            ctx.db.resting_order().order_id().delete(order.order_id);
            continue;
        };
        let price = asset.current_price;
        if !rules::order_should_fill(order.is_buy, order.is_stop, order.trigger_price, price) {
            continue;
        }

        let result = if order.is_buy {
            buy_at(ctx, order.owner_identity, &order.ticker, order.shares, price)
        } else {
            sell_at(ctx, order.owner_identity, &order.ticker, order.shares, price)
        };
        if let Err(e) = result {
            spacetimedb::log::info!("[ORDER] {} triggered but unfillable, cancelling: {}", order.order_id, e);
        }
        // Filled or unfillable, the order is consumed either way.
        ctx.db.resting_order().order_id().delete(order.order_id);
    }
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

    if !rules::can_afford(player.cash_balance, catalog.price) {
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

    let cost = rules::knowledge_upgrade_cost(player.knowledge_level);
    if !rules::can_afford(player.cash_balance, cost) {
        return Err(format!("Need ${:.0} to study the next level", cost));
    }

    player.cash_balance -= cost;
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
