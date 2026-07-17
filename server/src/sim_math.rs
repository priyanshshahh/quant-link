//! Pure, dependency-free simulation math.
//!
//! This is the quantitative core of the game — the Geometric Brownian Motion
//! price process, its seeded RNG, and the firm cash-flow accounting. It is
//! deliberately free of any `spacetimedb` types so it compiles and runs on the
//! native host target, which lets `cargo test` exercise the *exact* math the
//! WASM module runs (see `market_logic.rs` / `firm_logic.rs`, which call in
//! here) rather than a copy of it.

/// Deterministic linear-congruential RNG used by the market tick.
///
/// Seeded from the tick id so a market path is reproducible ("replayable").
/// The multiplier/increment are the MMIX (Knuth) LCG constants; `uniform01`
/// uses the full 64-bit state so the high-quality high bits dominate.
pub struct ReplayRng {
    state: u64,
}

impl ReplayRng {
    pub fn seed(seed: u64) -> Self {
        Self {
            state: seed.wrapping_mul(0x9E37_79B9_7F4A_7C15),
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);
        self.state
    }

    /// Uniform draw in [0, 1).
    pub fn uniform01(&mut self) -> f64 {
        const SCALE: f64 = 1.0 / (u64::MAX as f64);
        (self.next_u64() as f64) * SCALE
    }

    /// Standard-normal draw via the Box–Muller transform.
    pub fn standard_normal(&mut self) -> f64 {
        let u1 = self.uniform01().max(1e-12);
        let u2 = self.uniform01();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

/// One Geometric Brownian Motion price step.
///
/// `price_{t+1} = price_t * exp((mu - sigma^2/2) * dt + sigma * sqrt(dt) * z)`
/// where `z` is a standard-normal draw. The `-sigma^2/2` term is the Itô
/// correction (variance drag). Price is floored at 1 cent so an asset can never
/// go negative or to exactly zero.
pub fn gbm_step(price: f64, drift: f64, volatility: f64, dt: f64, z: f64) -> f64 {
    let drift_term = (drift - (volatility * volatility) / 2.0) * dt;
    let shock_term = volatility * dt.sqrt() * z;
    (price * (drift_term + shock_term).exp()).max(0.01)
}

/// Per-tick firm cash flow: rent income + passive portfolio alpha − salaries.
///
/// A positive result grows the owner's cash; a negative result (salaries
/// outweigh income) bleeds it. `total_alpha` is the summed per-tick alpha of
/// all employees, applied to the live `portfolio_value`.
pub fn firm_net_flow(rent: f64, portfolio_value: f64, total_alpha: f64, total_salary: f64) -> f64 {
    rent + portfolio_value * total_alpha - total_salary
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAILY_DT: f64 = 1.0 / 252.0;

    // ---- ReplayRng -------------------------------------------------------

    #[test]
    fn rng_is_deterministic_for_a_given_seed() {
        let mut a = ReplayRng::seed(42);
        let mut b = ReplayRng::seed(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn rng_diverges_for_different_seeds() {
        let mut a = ReplayRng::seed(1);
        let mut b = ReplayRng::seed(2);
        let differ = (0..64).any(|_| a.next_u64() != b.next_u64());
        assert!(differ, "distinct seeds must not produce identical streams");
    }

    #[test]
    fn uniform01_stays_in_unit_interval() {
        let mut rng = ReplayRng::seed(7);
        for _ in 0..100_000 {
            let u = rng.uniform01();
            assert!((0.0..1.0).contains(&u), "uniform01 out of range: {u}");
        }
    }

    #[test]
    fn standard_normal_has_zero_mean_unit_variance() {
        let mut rng = ReplayRng::seed(12345);
        let n = 200_000usize;
        let mut sum = 0.0;
        let mut sum_sq = 0.0;
        for _ in 0..n {
            let z = rng.standard_normal();
            sum += z;
            sum_sq += z * z;
        }
        let mean = sum / n as f64;
        let var = sum_sq / n as f64 - mean * mean;
        assert!(mean.abs() < 0.02, "N(0,1) sample mean off: {mean}");
        assert!((var - 1.0).abs() < 0.05, "N(0,1) sample variance off: {var}");
    }

    // ---- GBM -------------------------------------------------------------

    #[test]
    fn gbm_is_flat_with_no_drift_no_vol() {
        // With sigma = 0 and mu = 0 the exponent is 0 for any z.
        for z in [-3.0, -1.0, 0.0, 1.0, 3.0] {
            let p = gbm_step(100.0, 0.0, 0.0, DAILY_DT, z);
            assert!((p - 100.0).abs() < 1e-9, "expected flat price, got {p}");
        }
    }

    #[test]
    fn gbm_zero_shock_equals_deterministic_drift() {
        // z = 0 => price grows by exactly exp((mu - sigma^2/2) * dt).
        let (mu, sigma, p0) = (0.1, 0.3, 100.0);
        let expected = p0 * ((mu - sigma * sigma / 2.0) * DAILY_DT).exp();
        let got = gbm_step(p0, mu, sigma, DAILY_DT, 0.0);
        assert!((got - expected).abs() < 1e-9, "got {got}, expected {expected}");
    }

    #[test]
    fn gbm_variance_drag_pulls_price_down_with_no_drift() {
        // mu = 0, high vol, z = 0: the Itô -sigma^2/2 term must lower the price.
        let p = gbm_step(100.0, 0.0, 0.5, 1.0, 0.0);
        assert!(p < 100.0, "variance drag should reduce price, got {p}");
    }

    #[test]
    fn gbm_prices_stay_positive_over_a_long_path() {
        let mut rng = ReplayRng::seed(2024);
        let mut price = 100.0;
        // Aggressive params to stress the floor.
        for _ in 0..500_000 {
            let z = rng.standard_normal();
            price = gbm_step(price, -0.2, 0.9, DAILY_DT, z);
            assert!(price > 0.0, "price went non-positive: {price}");
        }
    }

    #[test]
    fn gbm_log_returns_match_theoretical_moments() {
        // Single-step log-returns from a fixed base price must be distributed as
        // N((mu - sigma^2/2) * dt, sigma^2 * dt) — the defining GBM property.
        let (mu, sigma, dt, p0) = (0.1, 0.3, 1.0, 100.0);
        let mut rng = ReplayRng::seed(99);
        let n = 200_000usize;
        let mut sum = 0.0;
        let mut sum_sq = 0.0;
        for _ in 0..n {
            let z = rng.standard_normal();
            let new = gbm_step(p0, mu, sigma, dt, z);
            let logret = (new / p0).ln();
            sum += logret;
            sum_sq += logret * logret;
        }
        let mean = sum / n as f64;
        let var = sum_sq / n as f64 - mean * mean;
        let expected_mean = (mu - sigma * sigma / 2.0) * dt; // 0.055
        let expected_var = sigma * sigma * dt; // 0.09
        assert!(
            (mean - expected_mean).abs() < 0.005,
            "log-return mean {mean} != {expected_mean}"
        );
        assert!(
            (var - expected_var).abs() < 0.01,
            "log-return var {var} != {expected_var}"
        );
    }

    // ---- Firm accounting -------------------------------------------------

    #[test]
    fn firm_net_flow_is_zero_for_an_idle_firm() {
        // No properties, no employees, no portfolio => no cash movement.
        assert_eq!(firm_net_flow(0.0, 0.0, 0.0, 0.0), 0.0);
    }

    #[test]
    fn firm_net_flow_is_positive_when_income_beats_payroll() {
        // Rent 50 + alpha 0.001 on a $1M book (=1000) vs 200 salary => +850.
        let flow = firm_net_flow(50.0, 1_000_000.0, 0.001, 200.0);
        assert!((flow - 850.0).abs() < 1e-9, "unexpected flow: {flow}");
        assert!(flow > 0.0);
    }

    #[test]
    fn firm_net_flow_goes_negative_when_payroll_dominates() {
        // A firm with heavy headcount and no income bleeds cash every tick.
        let flow = firm_net_flow(0.0, 0.0, 0.0, 640.0);
        assert!(flow < 0.0, "over-staffed firm should lose money: {flow}");
    }

    #[test]
    fn firm_net_flow_is_monotonic_in_salary() {
        let base = firm_net_flow(10.0, 100_000.0, 0.0005, 100.0);
        let more_staff = firm_net_flow(10.0, 100_000.0, 0.0005, 300.0);
        assert!(more_staff < base, "more salary must reduce net flow");
        assert!((base - more_staff - 200.0).abs() < 1e-9);
    }
}
