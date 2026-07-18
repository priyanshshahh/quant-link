import React from 'react';
import { useEscapeClose } from '../useEscapeClose';

/**
 * MethodologyModal — an honest "how the market works" explainer.
 *
 * The whole thesis of QuantLink is a *server-authoritative simulation*, not a
 * real-data feed. This page states plainly what the model is (GBM + a regime
 * layer + mean-reverting vol), what it deliberately does NOT do, and why —
 * mirroring how real sims (e.g. TradingView) own their limitations. Every claim
 * here matches the shipped code in server/src/sim_math.rs + market_logic.rs.
 */
interface MethodologyModalProps {
  onClose: () => void;
}

export const MethodologyModal: React.FC<MethodologyModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  return (
    <div className="methodology-overlay" onClick={onClose}>
      <div className="methodology-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Market methodology">
        <div className="methodology-header">
          <div>
            <h2>How the QuantLink Market Works</h2>
            <span className="methodology-sub">An honest look at the model — what it simulates, and what it deliberately doesn&apos;t.</span>
          </div>
          <button className="methodology-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="methodology-body">
          <span className="methodology-flag">Simulation — not real market data, by design.</span>

          <section>
            <h3>The engine: Geometric Brownian Motion</h3>
            <p>
              Every price follows <strong>Geometric Brownian Motion (GBM)</strong>, the same
              log-normal process underpinning Black–Scholes. Each tick advances a price by:
            </p>
            <pre className="methodology-eq">Sₜ₊₁ = Sₜ · exp( (μ − σ²/2)·dt + σ·√dt·Z )</pre>
            <p>
              where <em>Z ~ N(0,1)</em>, <em>μ</em> is drift, <em>σ</em> is volatility, and the
              <em> −σ²/2</em> term is the Itô variance-drag correction. Prices stay strictly
              positive (log-normal) and never go to zero — a floor at $0.01 backstops it.
            </p>
            <p>
              A market tick runs server-side every 2 seconds; <em>dt</em> is that 2s expressed
              as a fraction of a 252-day × 6.5-hour trading year. The random draws come from a
              <strong> seeded RNG keyed to the tick id</strong>, so a given tick is deterministic
              and replayable even though it fires on a live schedule. The math is exercised by
              native unit tests against its exact production code path.
            </p>
          </section>

          <section>
            <h3>Beyond plain GBM: volatility regimes</h3>
            <p>
              GBM&apos;s best-known weakness is <strong>constant volatility</strong> — real markets
              cluster (calm stretches, then bursts of turbulence) and occasionally crash. So a
              <strong> regime state machine</strong> sits on top: the market is in one of
              <em> calm</em>, <em>volatile</em>, or <em>crisis</em>, transitioning once per tick via
              a simple Markov chain. Each regime persists (that persistence <em>is</em> the
              volatility clustering) and multiplies every asset&apos;s effective μ and σ — a crisis
              flips drift negative and blows volatility out; calm dampens it. This is a lightweight
              nod to <strong>Heston-style stochastic volatility</strong> and regime-switching
              models, without pretending to be one.
            </p>
          </section>

          <section>
            <h3>Shocks, remixes &amp; mean reversion</h3>
            <p>
              AI-generated news events and player-driven &ldquo;remixes&rdquo; jolt prices and spike
              volatility within clamped bounds. Afterwards, each asset&apos;s volatility
              <strong> mean-reverts toward its baseline</strong> every tick, so turbulence decays
              instead of compounding forever. All headlines are labelled <em>simulated</em>.
            </p>
          </section>

          <section>
            <h3>What this deliberately does NOT model</h3>
            <ul className="methodology-nots">
              <li><strong>No real market data.</strong> A core design choice — the server owns the price. Piping in real quotes would throw away the server-authoritative, replayable, multiplayer-consistent thesis.</li>
              <li><strong>No order book / matching engine.</strong> Trades fill instantly at the current simulated price. Resting limit/stop orders fill against that price, not against other users&apos; liquidity.</li>
              <li><strong>No fat tails or jumps</strong> beyond what regimes produce — no explicit Merton-style jump-diffusion.</li>
              <li><strong>No slippage, spreads, or fees.</strong> Fills are frictionless (the same honest limitation paper-trading platforms like TradingView disclose).</li>
              <li><strong>No cross-asset correlation.</strong> Each ticker&apos;s Brownian shock is independent within a tick.</li>
            </ul>
          </section>

          <section className="methodology-refs">
            <h3>Standard models referenced</h3>
            <p>
              Geometric Brownian Motion (Black–Scholes); Heston / regime-switching stochastic
              volatility for vol clustering; Merton jump-diffusion for the tail behaviour we
              intentionally leave out. This model is a principled, self-aware baseline — not a
              claim to forecast real prices.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
