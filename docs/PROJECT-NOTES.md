# QuantLink — Project Notes

Engineering notes: what is real and verified, what is simulated, and the exact
deploy plan. Companion to the README.

## What is real vs. simulated

| Component | Status |
|-----------|--------|
| SpacetimeDB Rust module (tables, reducers, scheduled ticks) | Real. Builds to WASM, runs the whole game. |
| GBM market engine | Real math, **simulated market** — GBM process, not real prices. |
| Firm cash-flow, quests, leaderboard | Real server-authoritative logic. |
| Ambient "breaking news" | **Simulated** generator (`source: 'simulated'`), no LLM call. |
| AI mentor (`/api/mentor`) | Real Gemini call, server-side. Offline heuristic fallback when no key. |
| Market "remix" (`/api/remix`) | Real Gemini parse, with a local keyword parser fallback. |
| `unreal/SimWorld/` | **Unused** early prototype. Not wired to the backend, not built, not shipped. |

## Verified behavior (real runs)

- `cd server && cargo test` → **13 passed, 0 failed**. Covers, on the exact
  production math in `sim_math.rs`:
  - GBM: flat at zero drift/vol; exact deterministic drift at `z=0`; Itô
    variance-drag lowers price when `μ=0`; prices stay positive over 500k steps;
    single-step log-returns match `N((μ−σ²/2)dt, σ²dt)`.
  - RNG: seed determinism, seed divergence, uniform ∈ [0,1), `N(0,1)` moments.
  - Firm: idle firm nets zero; income>payroll positive; payroll-heavy firm
    bleeds cash; net flow monotonic in salary.
- `cd server && cargo build --release --target wasm32-unknown-unknown` → clean.
- `cd client && npm run build` → succeeds (~1.5 MB bundle). Grep of `client/dist`
  finds **no key**, no `GEMINI_API_KEY`/`GOOGLE_API_KEY`, no `x-goog-api-key`,
  no `googleapis` — only `/api/mentor` and `/api/remix`.
- **AI mentor live-verify** (real key sourced from the campaign secrets file,
  never committed): the real `api/mentor.ts` handler, driven with a mock
  req/res, returned **HTTP 200** with a complete mentor reply on portfolio
  concentration (idiosyncratic risk, beta, diversification, position sizing) in
  **~1.6s**. Notes from the run:
  - `gemini-2.0-flash` was `RESOURCE_EXHAUSTED` (429) on the free test key;
    switched the default model to `gemini-flash-latest`, which returned 200.
  - The valid-key/quota-exceeded path maps correctly to a client-facing **502**
    ("Mentor AI is unavailable right now"); a missing key maps to **503**.
  - 2.5-class Flash "thinking" was truncating answers, so `thinkingBudget: 0` is
    set for these short tasks.

## Config coherence

Module name `quant-link` and host/db are env-driven and consistent across:
- `client/src/App.tsx` → `VITE_SPACETIME_HOST` / `VITE_SPACETIME_DB`
- `client/.env.example` → `127.0.0.1:3001` / `quant-link`
- `client/src/simulation.ts` → `SPACETIME_HOST`/`SPACETIME_DB` (same defaults)
- `scripts/publish-maincloud.sh`, `setup.sh` → `quant-link`

(Previously `simulation.ts` was hardcoded to `localhost:3000` / `vibe-multiplayer`.)

## Deploy plan (pending owner one-time logins)

### 1. Module → SpacetimeDB Maincloud

```bash
spacetime login                     # owner login (interactive)
scripts/publish-maincloud.sh        # spacetime build + publish quant-link to maincloud
```

Then regenerate client bindings against the published module if the schema
changed, and set the client env for production:

```
VITE_SPACETIME_HOST=maincloud.spacetimedb.com
VITE_SPACETIME_DB=quant-link
```

### 2. Client + AI proxy → Vercel

`vercel.json` builds `client/` to `client/dist` and serves `api/` as functions.

```bash
vercel login                        # owner login (interactive)
# Project → Settings → Environment Variables:
#   GEMINI_API_KEY (or GOOGLE_API_KEY)   [and optionally GEMINI_MODEL]
#   VITE_SPACETIME_HOST = maincloud.spacetimedb.com
#   VITE_SPACETIME_DB   = quant-link
vercel --prod
```

### Post-deploy smoke checks

1. Client loads, connects to Maincloud, a player can register and move.
2. Prices tick every ~2s for all connected clients simultaneously.
3. `POST /api/mentor` returns 200 with a reply (or 503 if the key is unset).
4. Re-grep the deployed bundle to confirm no key leaked.

## Known limitations / honesty

- The in-memory rate limiter is per warm lambda instance, not global — fine for
  throttling a single client, not a hard quota guarantee.
- The market is a simulation; do not present any number as real market data.
- Deployment is not yet live (awaits the owner logins above).
