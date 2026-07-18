//! Pure, dependency-free game rules: anti-abuse guards and reducer validation.
//!
//! Like `sim_math.rs`, this module deliberately avoids any `spacetimedb` types
//! so it compiles and unit-tests on the native host. The reducers in
//! `lib.rs` / `market_logic.rs` / `firm_logic.rs` call into these functions, so
//! `cargo test` exercises the *exact* validation logic the WASM module runs
//! rather than a parallel copy.

/// Target client input cadence (~20Hz). The server assumes each
/// `update_player_input` call represents roughly one tick of movement.
pub const INPUT_TICK_SECONDS: f64 = 1.0 / 20.0;

/// Per-identity cooldown before another market shock may be applied (micros).
pub const SHOCK_COOLDOWN_MICROS: i64 = 4_000_000; // 4s
/// Per-identity cooldown before another market remix may be applied (micros).
pub const REMIX_COOLDOWN_MICROS: i64 = 3_000_000; // 3s

// ---- Anti-speed-hack: server-measured movement dt --------------------------

/// Clamp a server-measured elapsed time (seconds) between two consecutive
/// `update_player_input` calls into a safe movement `dt`.
///
/// This is the core anti-speed-hack: instead of trusting a fixed `1/20`s per
/// call (which lets a modified client that calls at 200Hz move 10x too fast),
/// the server measures real elapsed wall-clock time between calls. Spamming
/// calls therefore yields a tiny `dt` each time; a stalled client that resumes
/// after a long pause is capped at `2 * tick` so it can't teleport. Negative
/// deltas (clock skew / reordering) clamp to zero.
pub fn clamp_input_dt(elapsed_secs: f64, tick_secs: f64) -> f64 {
    let max_dt = tick_secs * 2.0;
    elapsed_secs.clamp(0.0, max_dt)
}

// ---- Anti-abuse: per-identity action cooldown ------------------------------

/// Returns `true` if enough time has elapsed since the caller's last action of
/// this kind (or they have never performed it). Used to rate-limit the
/// market-moving reducers (`apply_market_shock`, `remix_market`) server-side,
/// which are otherwise callable as fast as a raw WebSocket allows.
pub fn cooldown_elapsed(last_at_micros: i64, now_micros: i64, cooldown_micros: i64) -> bool {
    // `last_at_micros == 0` is the sentinel for "never acted" (fresh guard row).
    if last_at_micros == 0 {
        return true;
    }
    now_micros.saturating_sub(last_at_micros) >= cooldown_micros
}

// ---- Market shock / remix clamps -------------------------------------------

/// Clamp a raw AI/headline sentiment score to the supported [-10, 10] range.
pub fn clamp_sentiment(sentiment: i32) -> i32 {
    sentiment.clamp(-10, 10)
}

/// Clamp a remix drift modifier to the supported per-call range.
pub fn clamp_drift_mod(drift_modifier: f64) -> f64 {
    drift_modifier.clamp(-0.5, 0.5)
}

/// Clamp a remix volatility modifier to the supported per-call range.
pub fn clamp_vol_mod(volatility_modifier: f64) -> f64 {
    volatility_modifier.clamp(-0.5, 0.8)
}

/// Immediate price multiplier a remix applies, derived from (already clamped)
/// drift, capped at +/-25% so a single call can't move price arbitrarily far.
pub fn remix_price_jolt(drift_mod: f64) -> f64 {
    1.0 + drift_mod.clamp(-0.25, 0.25)
}

/// Clamp a market asset's resulting long-run drift after a remix.
pub fn clamp_asset_drift(drift: f64) -> f64 {
    drift.clamp(-0.6, 0.8)
}

/// Clamp a market asset's resulting volatility after a shock/remix.
pub fn clamp_asset_volatility(volatility: f64) -> f64 {
    volatility.clamp(0.05, 0.95)
}

// ---- Trade / firm validation edges -----------------------------------------

/// Whether the caller can afford a purchase. Centralised so the funds check is
/// consistent across trades, vehicles, properties, hires and firm upgrades.
pub fn can_afford(cash_balance: f64, cost: f64) -> bool {
    cash_balance >= cost
}

/// New weighted-average cost basis after buying `add_shares` at `price` on top
/// of an existing position. Returns the blended average entry price.
pub fn weighted_average_price(
    existing_shares: f64,
    existing_avg: f64,
    add_shares: f64,
    price: f64,
) -> f64 {
    let total_shares = existing_shares + add_shares;
    if total_shares <= 0.0 {
        return price;
    }
    ((existing_avg * existing_shares) + (price * add_shares)) / total_shares
}

/// A sell request is valid only for a strictly positive quantity the position
/// actually holds.
pub fn can_sell(position_shares: f64, requested: f64) -> bool {
    requested > 0.0 && position_shares >= requested
}

/// Whether a remaining position is float-dust and should be deleted rather than
/// left as a near-zero row.
pub fn is_dust_position(remaining_shares: f64) -> bool {
    remaining_shares < 0.0001
}

/// Maximum firm headcount at a given tier: 8 base + 4 per tier.
pub fn headcount_cap(tier: u32) -> usize {
    8 + (tier * 4) as usize
}

/// Escalating cash cost to buy the next knowledge level (level 0->1 costs
/// $25k, 1->2 $50k, 2->3 $75k). Knowledge is framed as a purchasable upgrade
/// path in the UI, so it should draw down cash rather than being free.
pub fn knowledge_upgrade_cost(current_level: u32) -> f64 {
    25_000.0 * (current_level as f64 + 1.0)
}

/// FNV-1a fold of a byte slice into a u64. Used to derive a stable per-identity
/// value (identities are 32 bytes) without pulling in a hashing dependency.
pub fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV-1a offset basis
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3); // FNV prime
    }
    h
}

/// Deterministic index in `[0, n)` from a hash. Used to pick a spawn color from
/// the player's identity so the colour is stable per identity, instead of being
/// assigned by join order (which collides after enough join/leave churn).
pub fn index_from_hash(hash: u64, n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    (hash % n as u64) as usize
}

/// Per-tick salary for a hireable role, or `None` for an unrecognised role.
pub fn role_salary(role: &str) -> Option<f64> {
    match role {
        "trader" => Some(80.0),
        "researcher" => Some(65.0),
        "compliance" => Some(55.0),
        "engineer" => Some(90.0),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- clamp_input_dt ---------------------------------------------------

    #[test]
    fn input_dt_passes_a_normal_tick_through() {
        let dt = clamp_input_dt(INPUT_TICK_SECONDS, INPUT_TICK_SECONDS);
        assert!((dt - INPUT_TICK_SECONDS).abs() < 1e-12);
    }

    #[test]
    fn input_dt_caps_a_fast_spammer_to_the_real_tiny_delta() {
        // 200Hz caller: 5ms elapsed -> dt stays 5ms, NOT the assumed 50ms.
        let dt = clamp_input_dt(0.005, INPUT_TICK_SECONDS);
        assert!((dt - 0.005).abs() < 1e-12, "fast caller must move by real dt");
    }

    #[test]
    fn input_dt_caps_a_long_stall_at_two_ticks() {
        // Client froze for 10s then resumed: cannot teleport, capped at 2 ticks.
        let dt = clamp_input_dt(10.0, INPUT_TICK_SECONDS);
        assert!((dt - 2.0 * INPUT_TICK_SECONDS).abs() < 1e-12);
    }

    #[test]
    fn input_dt_clamps_negative_to_zero() {
        assert_eq!(clamp_input_dt(-1.0, INPUT_TICK_SECONDS), 0.0);
    }

    // ---- cooldown_elapsed -------------------------------------------------

    #[test]
    fn cooldown_first_call_always_allowed() {
        assert!(cooldown_elapsed(0, 5_000_000, SHOCK_COOLDOWN_MICROS));
    }

    #[test]
    fn cooldown_rejects_rapid_repeat() {
        let now = 10_000_000;
        // Last call 100ms ago, cooldown 4s -> rejected.
        assert!(!cooldown_elapsed(now - 100_000, now, SHOCK_COOLDOWN_MICROS));
    }

    #[test]
    fn cooldown_allows_after_window() {
        let now = 20_000_000;
        assert!(cooldown_elapsed(now - SHOCK_COOLDOWN_MICROS, now, SHOCK_COOLDOWN_MICROS));
    }

    #[test]
    fn cooldown_is_saturating_and_never_panics_on_skew() {
        // last in the "future" relative to now must not overflow/allow.
        assert!(!cooldown_elapsed(i64::MAX, 0, REMIX_COOLDOWN_MICROS));
    }

    // ---- shock / remix clamps --------------------------------------------

    #[test]
    fn sentiment_is_bounded() {
        assert_eq!(clamp_sentiment(999), 10);
        assert_eq!(clamp_sentiment(-999), -10);
        assert_eq!(clamp_sentiment(3), 3);
    }

    #[test]
    fn drift_and_vol_mods_are_bounded() {
        assert_eq!(clamp_drift_mod(5.0), 0.5);
        assert_eq!(clamp_drift_mod(-5.0), -0.5);
        assert_eq!(clamp_vol_mod(5.0), 0.8);
        assert_eq!(clamp_vol_mod(-5.0), -0.5);
    }

    #[test]
    fn remix_price_jolt_capped_at_quarter() {
        assert!((remix_price_jolt(10.0) - 1.25).abs() < 1e-12);
        assert!((remix_price_jolt(-10.0) - 0.75).abs() < 1e-12);
        assert!((remix_price_jolt(0.1) - 1.1).abs() < 1e-12);
    }

    #[test]
    fn asset_drift_and_vol_stay_in_band() {
        assert_eq!(clamp_asset_drift(10.0), 0.8);
        assert_eq!(clamp_asset_drift(-10.0), -0.6);
        assert_eq!(clamp_asset_volatility(10.0), 0.95);
        assert_eq!(clamp_asset_volatility(-10.0), 0.05);
    }

    // ---- trade / firm validation -----------------------------------------

    #[test]
    fn can_afford_boundary() {
        assert!(can_afford(100.0, 100.0));
        assert!(can_afford(100.0, 99.99));
        assert!(!can_afford(100.0, 100.01));
    }

    #[test]
    fn weighted_average_price_blends_correctly() {
        // 10 @ $100 then 10 @ $200 => avg $150.
        let avg = weighted_average_price(10.0, 100.0, 10.0, 200.0);
        assert!((avg - 150.0).abs() < 1e-9);
    }

    #[test]
    fn weighted_average_price_on_fresh_position_is_price() {
        let avg = weighted_average_price(0.0, 0.0, 5.0, 42.0);
        assert!((avg - 42.0).abs() < 1e-9);
    }

    #[test]
    fn can_sell_rejects_overdraw_and_nonpositive() {
        assert!(can_sell(10.0, 10.0));
        assert!(can_sell(10.0, 4.0));
        assert!(!can_sell(10.0, 10.1));
        assert!(!can_sell(10.0, 0.0));
        assert!(!can_sell(10.0, -1.0));
    }

    #[test]
    fn dust_position_threshold() {
        assert!(is_dust_position(0.00005));
        assert!(!is_dust_position(0.5));
    }

    #[test]
    fn headcount_cap_scales_with_tier() {
        assert_eq!(headcount_cap(0), 8);
        assert_eq!(headcount_cap(1), 12);
        assert_eq!(headcount_cap(3), 20);
    }

    #[test]
    fn role_salary_known_and_unknown() {
        assert_eq!(role_salary("trader"), Some(80.0));
        assert_eq!(role_salary("engineer"), Some(90.0));
        assert_eq!(role_salary("astronaut"), None);
    }

    #[test]
    fn knowledge_cost_escalates_per_level() {
        assert_eq!(knowledge_upgrade_cost(0), 25_000.0);
        assert_eq!(knowledge_upgrade_cost(1), 50_000.0);
        assert_eq!(knowledge_upgrade_cost(2), 75_000.0);
    }

    #[test]
    fn hash_bytes_is_deterministic_and_sensitive() {
        assert_eq!(hash_bytes(&[1, 2, 3]), hash_bytes(&[1, 2, 3]));
        assert_ne!(hash_bytes(&[1, 2, 3]), hash_bytes(&[3, 2, 1]));
    }

    #[test]
    fn index_from_hash_is_bounded() {
        for h in [0u64, 1, 7, 1_000_000, u64::MAX] {
            assert!(index_from_hash(h, 6) < 6);
        }
        assert_eq!(index_from_hash(123, 0), 0); // no panic on empty
    }
}
