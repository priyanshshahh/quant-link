use spacetimedb::{ReducerContext, Table};

use crate::{
    completed_quest, employee, firm, owned_property, owned_vehicle, player, portfolio,
    CompletedQuest,
};
use crate::firm_logic::calc_net_worth;
use std::collections::HashSet;

/// Career objective catalog. Each entry is (key, cash reward).
/// The condition itself is validated in `quest_condition_met` so a player can
/// never claim a reward they haven't actually earned (server-authoritative).
pub const QUESTS: [(&str, f64); 10] = [
    ("first_trade", 5_000.0),
    ("diversify", 15_000.0),
    ("six_figures", 10_000.0),
    ("first_hire", 8_000.0),
    ("team_builder", 25_000.0),
    ("property_mogul", 20_000.0),
    ("knowledge", 5_000.0),
    ("first_car", 10_000.0),
    ("firm_upgrade", 30_000.0),
    ("whale", 100_000.0),
];

fn quest_condition_met(ctx: &ReducerContext, quest_key: &str) -> bool {
    let sender = ctx.sender();
    let Some(player) = ctx.db.player().identity().find(sender) else {
        return false;
    };

    match quest_key {
        "first_trade" => ctx.db.portfolio().by_owner().filter(sender).count() >= 1,
        "diversify" => {
            let tickers: HashSet<String> = ctx
                .db
                .portfolio()
                .by_owner()
                .filter(sender)
                .map(|p| p.ticker)
                .collect();
            tickers.len() >= 3
        }
        "six_figures" => calc_net_worth(ctx, &player) >= 150_000.0,
        "first_hire" => ctx.db.employee().by_owner().filter(sender).count() >= 1,
        "team_builder" => ctx.db.employee().by_owner().filter(sender).count() >= 3,
        "property_mogul" => ctx.db.owned_property().by_owner().filter(sender).count() >= 1,
        "knowledge" => player.knowledge_level >= 1,
        "first_car" => ctx.db.owned_vehicle().by_owner().filter(sender).count() >= 1,
        "firm_upgrade" => ctx
            .db
            .firm()
            .owner_identity()
            .find(sender)
            .map(|f| f.tier >= 1)
            .unwrap_or(false),
        "whale" => calc_net_worth(ctx, &player) >= 1_000_000.0,
        _ => false,
    }
}

/// Validate and pay out a career objective. Rejects unknown quests, already
/// claimed quests, and quests whose condition is not actually satisfied.
pub fn claim_quest_reward(ctx: &ReducerContext, quest_key: String) -> Result<(), String> {
    let sender = ctx.sender();

    let Some((_, reward)) = QUESTS.iter().find(|(k, _)| *k == quest_key) else {
        return Err("Unknown objective".to_string());
    };

    let already = ctx
        .db
        .completed_quest()
        .by_owner()
        .filter(sender)
        .any(|q| q.quest_key == quest_key);
    if already {
        return Err("Objective already claimed".to_string());
    }

    if !quest_condition_met(ctx, &quest_key) {
        return Err("Objective not completed yet".to_string());
    }

    let mut player = ctx
        .db
        .player()
        .identity()
        .find(sender)
        .ok_or("Player not found")?;
    player.cash_balance += reward;
    ctx.db.player().identity().update(player);

    ctx.db.completed_quest().insert(CompletedQuest {
        record_id: 0,
        owner_identity: sender,
        quest_key,
        claimed_at: ctx.timestamp,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::QUESTS;
    use std::collections::HashMap;

    /// The client (`client/src/gameConstants.json`) is the single source of
    /// truth for quest keys + reward amounts; this test parses that file and
    /// asserts the Rust `QUESTS` catalog matches it (same keys, same rewards).
    /// The client lists quests in display order, so compare by key, not index.
    #[test]
    fn quests_match_shared_game_constants() {
        let raw = include_str!("../../client/src/gameConstants.json");
        let json: serde_json::Value = serde_json::from_str(raw).expect("valid JSON");
        let quests = json["quests"].as_array().expect("quests array");

        assert_eq!(quests.len(), QUESTS.len(), "quest count drift");

        let json_rewards: HashMap<&str, f64> = quests
            .iter()
            .map(|q| (q["key"].as_str().unwrap(), q["reward"].as_f64().unwrap()))
            .collect();

        for (key, reward) in QUESTS {
            let json_reward = json_rewards
                .get(key)
                .unwrap_or_else(|| panic!("quest '{key}' missing from gameConstants.json"));
            assert_eq!(*json_reward, reward, "reward drift for quest '{key}'");
        }
    }
}
