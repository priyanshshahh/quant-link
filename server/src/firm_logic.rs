use spacetimedb::{Identity, ReducerContext, Table};

use crate::rules;
use crate::{
    employee, firm, market_asset, owned_property, player, portfolio, property_catalog, rich_list,
    Employee, FirmData, OwnedProperty, PlayerData, PropertyCatalog, RichListEntry,
};

const TIERS: [(&str, f64, f64); 4] = [
    ("Studio Apartment", 0.0, 0.0),
    ("Small Office", 250_000.0, 50_000.0),
    ("Trading Floor", 1_000_000.0, 200_000.0),
    ("Wall Street Tower", 5_000_000.0, 1_000_000.0),
];

pub fn seed_property_catalog(ctx: &ReducerContext) {
    if ctx.db.property_catalog().count() > 0 {
        return;
    }

    let properties = [
        ("studio", "Studio Apartment", 0.0, "apartment", 0, 0.0, 0.0),
        ("loft", "Brickell Loft", 180_000.0, "apartment", 0, 5.0, 2.0),
        ("office_small", "Day-Trade Office", 320_000.0, "office", 1, 15.0, 5.0),
        ("office_floor", "Trading Floor Suite", 1_200_000.0, "office", 2, 40.0, 12.0),
        ("penthouse", "Ocean Drive Penthouse", 2_500_000.0, "penthouse", 2, 25.0, 20.0),
        ("tower", "Wall Street Tower Suite", 8_000_000.0, "office", 3, 100.0, 35.0),
        ("nightclub", "VIP Nightclub Stake", 500_000.0, "lifestyle", 1, 10.0, 15.0),
        ("marina", "Yacht Marina Slip", 750_000.0, "lifestyle", 2, 20.0, 18.0),
    ];

    for (key, name, price, ptype, tier, rent, rep) in properties {
        ctx.db.property_catalog().insert(PropertyCatalog {
            property_key: key.to_string(),
            display_name: name.to_string(),
            price,
            property_type: ptype.to_string(),
            firm_tier_required: tier,
            rent_per_tick: rent,
            reputation_bonus: rep,
        });
    }
}

pub fn ensure_firm(ctx: &ReducerContext, owner: Identity, firm_name: &str) {
    if ctx.db.firm().owner_identity().find(owner).is_some() {
        return;
    }
    ctx.db.firm().insert(FirmData {
        owner_identity: owner,
        firm_name: firm_name.to_string(),
        tier: 0,
        reputation: 50.0,
        aum: 100_000.0,
        regulatory_risk: 10.0,
        total_profit: 0.0,
    });
}

pub fn calc_net_worth(ctx: &ReducerContext, player: &PlayerData) -> f64 {
    let mut portfolio_value = 0.0;
    for position in ctx.db.portfolio().by_owner().filter(player.identity) {
        let price = ctx
            .db
            .market_asset()
            .ticker()
            .find(&position.ticker)
            .map(|a| a.current_price)
            .unwrap_or(position.average_entry_price);
        portfolio_value += position.shares * price;
    }
    player.cash_balance + portfolio_value
}

pub fn hire_employee(ctx: &ReducerContext, role: String) -> Result<(), String> {
    let sender = ctx.sender();
    let player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    let firm = ctx
        .db
        .firm()
        .owner_identity()
        .find(sender)
        .ok_or("Firm not found")?;

    let employee_count = ctx
        .db
        .employee()
        .by_owner()
        .filter(sender)
        .count();

    if employee_count >= rules::headcount_cap(firm.tier) {
        return Err("Max headcount reached. Upgrade your firm tier.".to_string());
    }

    // Salary is the single source of truth in `rules::role_salary`, which also
    // rejects unknown roles; the per-role alpha/reputation/risk deltas stay here.
    let salary = rules::role_salary(&role)
        .ok_or("Invalid role. Choose: trader, researcher, compliance, engineer")?;
    let (alpha, rep_effect, risk_effect, name) = match role.as_str() {
        "trader" => (0.0003, 1.0, 2.0, random_name(1)),
        "researcher" => (0.0005, 2.0, -1.0, random_name(2)),
        "compliance" => (0.0, 3.0, -5.0, random_name(3)),
        "engineer" => (0.0002, 1.5, 0.0, random_name(4)),
        _ => unreachable!("role validated by rules::role_salary above"),
    };

    let signing_bonus = salary * 10.0;
    if !rules::can_afford(player.cash_balance, signing_bonus) {
        return Err(format!("Need ${:.0} signing bonus to hire", signing_bonus));
    }

    let mut player = player;
    player.cash_balance -= signing_bonus;
    ctx.db.player().identity().update(player);

    ctx.db.employee().insert(Employee {
        employee_id: 0,
        owner_identity: sender,
        role: role.clone(),
        name,
        salary_per_tick: salary,
        alpha_bonus: alpha,
    });

    let mut firm = firm;
    firm.reputation = (firm.reputation + rep_effect).clamp(0.0, 100.0);
    firm.regulatory_risk = (firm.regulatory_risk + risk_effect).clamp(0.0, 100.0);
    ctx.db.firm().owner_identity().update(firm);

    Ok(())
}

pub fn buy_property(ctx: &ReducerContext, property_key: String) -> Result<(), String> {
    let sender = ctx.sender();
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    let catalog = ctx
        .db
        .property_catalog()
        .property_key()
        .find(&property_key)
        .ok_or("Property not found")?;

    if catalog.price > 0.0 && !rules::can_afford(player.cash_balance, catalog.price) {
        return Err("Insufficient funds".to_string());
    }

    let firm = ctx
        .db
        .firm()
        .owner_identity()
        .find(sender)
        .ok_or("Firm not found")?;

    if firm.tier < catalog.firm_tier_required {
        return Err(format!(
            "Requires firm tier {} (you are tier {})",
            catalog.firm_tier_required, firm.tier
        ));
    }

    if ctx
        .db
        .owned_property()
        .by_owner()
        .filter(sender)
        .any(|p| p.property_key == property_key)
    {
        return Err("You already own this property".to_string());
    }

    player.cash_balance -= catalog.price;
    ctx.db.player().identity().update(player);

    let mut firm = firm;
    firm.reputation = (firm.reputation + catalog.reputation_bonus).clamp(0.0, 100.0);
    ctx.db.firm().owner_identity().update(firm);

    ctx.db.owned_property().insert(OwnedProperty {
        property_id: 0,
        owner_identity: sender,
        property_key: catalog.property_key.clone(),
        display_name: catalog.display_name.clone(),
        property_type: catalog.property_type.clone(),
    });

    Ok(())
}

pub fn upgrade_firm(ctx: &ReducerContext) -> Result<(), String> {
    let sender = ctx.sender();
    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;

    let mut firm = ctx
        .db
        .firm()
        .owner_identity()
        .find(sender)
        .ok_or("Firm not found")?;

    let next_tier = firm.tier + 1;
    if next_tier as usize >= TIERS.len() {
        return Err("Already at max firm tier".to_string());
    }

    let (_, net_worth_req, upgrade_cost) = TIERS[next_tier as usize];
    let net_worth = calc_net_worth(ctx, &player);

    if net_worth < net_worth_req {
        return Err(format!(
            "Need ${:.0} net worth (have ${:.0})",
            net_worth_req, net_worth
        ));
    }
    if !rules::can_afford(player.cash_balance, upgrade_cost) {
        return Err(format!("Need ${:.0} cash for upgrade", upgrade_cost));
    }

    player.cash_balance -= upgrade_cost;
    ctx.db.player().identity().update(player);

    firm.tier = next_tier;
    firm.reputation = (firm.reputation + 10.0).clamp(0.0, 100.0);
    ctx.db.firm().owner_identity().update(firm);

    Ok(())
}

pub fn process_firm_tick(ctx: &ReducerContext) {
    for mut player in ctx.db.player().iter() {
        let sender = player.identity;
        let Some(mut firm) = ctx.db.firm().owner_identity().find(sender) else {
            continue;
        };

        let mut total_salary = 0.0;
        let mut total_alpha = 0.0;

        for emp in ctx.db.employee().by_owner().filter(sender) {
            total_salary += emp.salary_per_tick;
            total_alpha += emp.alpha_bonus;
        }

        let mut rent = 0.0;
        for prop in ctx.db.owned_property().by_owner().filter(sender) {
            if let Some(cat) = ctx.db.property_catalog().property_key().find(&prop.property_key) {
                rent += cat.rent_per_tick;
            }
        }

        let portfolio_value: f64 = ctx
            .db
            .portfolio()
            .by_owner()
            .filter(sender)
            .map(|p| {
                let price = ctx
                    .db
                    .market_asset()
                    .ticker()
                    .find(&p.ticker)
                    .map(|a| a.current_price)
                    .unwrap_or(p.average_entry_price);
                p.shares * price
            })
            .sum();

        let net_flow =
            crate::sim_math::firm_net_flow(rent, portfolio_value, total_alpha, total_salary);

        player.cash_balance += net_flow;
        firm.aum = player.cash_balance + portfolio_value;
        firm.total_profit += net_flow.max(0.0);

        if firm.regulatory_risk > 50.0 {
            firm.reputation = (firm.reputation - 0.1).max(0.0);
        } else if firm.reputation < 100.0 {
            firm.reputation = (firm.reputation + 0.05).min(100.0);
        }

        ctx.db.player().identity().update(player);
        ctx.db.firm().owner_identity().update(firm);
    }
}

/// Recompute the global Rich List each tick: rank all players by net worth
/// (cash + live portfolio value) and persist the top 5 into the `rich_list`
/// table. Reducers may iterate freely, so the heavy work lives here; the
/// `rich_list_view` view then exposes the result to clients via indexed reads.
pub fn update_rich_list(ctx: &ReducerContext) {
    let mut entries: Vec<(f64, Identity, String, String, u32)> = Vec::new();

    for player in ctx.db.player().iter() {
        let net_worth = calc_net_worth(ctx, &player);
        let (firm_name, tier) = ctx
            .db
            .firm()
            .owner_identity()
            .find(player.identity)
            .map(|f| (f.firm_name, f.tier))
            .unwrap_or_else(|| (player.username.clone(), 0));
        entries.push((net_worth, player.identity, player.username.clone(), firm_name, tier));
    }

    // Sort by net worth descending (richest first).
    entries.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Clear the previous leaderboard rows.
    let existing_ranks: Vec<u32> = ctx.db.rich_list().iter().map(|e| e.rank).collect();
    for rank in existing_ranks {
        ctx.db.rich_list().rank().delete(rank);
    }

    // Write the new top 5.
    for (i, (net_worth, identity, username, firm_name, tier)) in
        entries.into_iter().take(5).enumerate()
    {
        ctx.db.rich_list().insert(RichListEntry {
            rank: (i as u32) + 1,
            identity,
            username,
            firm_name,
            net_worth,
            tier,
        });
    }
}

fn random_name(seed: u64) -> String {
    const FIRST: [&str; 8] = ["Alex", "Jordan", "Morgan", "Riley", "Casey", "Quinn", "Avery", "Blake"];
    const LAST: [&str; 8] = ["Chen", "Park", "Shah", "Kim", "Ross", "Vega", "Nash", "Cross"];
    let i = seed % 8;
    let j = (seed * 7 + 3) % 8;
    format!("{} {}", FIRST[i as usize], LAST[j as usize])
}
