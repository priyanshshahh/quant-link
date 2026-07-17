# QuantLink — Real-Time Financial Simulation Game

A multiplayer 3D quant-trading life-sim. Players walk a financial city, trade a
server-authoritative market driven by Geometric Brownian Motion, build a hedge
fund, buy property and vehicles, complete finance-education quests, and consult
an AI quant mentor. Built on **SpacetimeDB 2.x** (Rust → WASM) with a **React 19
+ React Three Fiber** client and a **Google Gemini** serverless proxy.

This project began as the community [3D Multiplayer starter](https://github.com/majidmanzarpour/vibe-coding-starter-pack-3d-multiplayer)
(hence the wizard/paladin avatars, health/mana HUD, and movement code) and was
extended into a trading sim.

## Architecture

- `server/` — SpacetimeDB Rust module, compiled to WASM, runs on the DB host.
  All game state and game logic live here (no external DB or message broker).
- `client/` — Vite + React + React Three Fiber frontend. Connects over
  WebSocket, subscribes to tables, calls reducers.
- `api/` — Vercel Node serverless functions (the Gemini proxy). Zero npm deps.
- `unreal/SimWorld/` — an **unused** early Unreal Engine prototype of a GTA-style
  client. It is NOT wired to the backend, NOT built, and NOT part of the shipped
  game (the React Three Fiber client is the real client). Kept only as a
  reference sketch; ignore it for all normal work. See its README_BLUEPRINTS.md.

Data flow (gameplay): client input (20Hz) → WebSocket → `update_player_input`
reducer → `player` table update → subscription → all clients render.

Data flow (market): scheduled `process_market_tick` reducer every 2s advances
every asset one GBM step server-side → `market_asset` table update →
subscription → every client sees the same prices at the same time.

## Server (Rust) — `server/src/`

- `lib.rs` — all table definitions + reducers + lifecycle handlers
  (`init`, `identity_connected`, `identity_disconnected`). Reducers:
  `register_player`, `update_player_input`, `game_tick` (scheduled economy
  tick), `process_market_tick` (scheduled GBM tick), `execute_trade`,
  `buy_vehicle`, `upgrade_knowledge_level`, `hire_employee`, `buy_property`,
  `upgrade_firm`, `claim_quest_reward`, `apply_market_shock`, `remix_market`.
- `market_logic.rs` — market seeding, the GBM tick, buy/sell, vehicles,
  AI market shocks and the natural-language "remix" engine.
- `firm_logic.rs` — firm creation/tiers, employees, properties, per-tick
  cash flow, and the global net-worth "Rich List" leaderboard.
- `quest_logic.rs` — career-objective catalog + server-side condition checks so
  a reward can never be claimed without actually meeting its condition.
- `player_logic.rs` — movement math (`calculate_new_position`) and input→state
  translation (`update_input_state`).
- `sim_math.rs` — **pure, dependency-free quant core**: `gbm_step`, the seeded
  `ReplayRng`, and `firm_net_flow`. Free of `spacetimedb` types so it compiles
  and unit-tests on the native host. `market_logic`/`firm_logic` call into it,
  so `cargo test` covers the exact production math.
- `common.rs` — `Vector3`, `InputState`, `PLAYER_SPEED`, `SPRINT_MULTIPLIER`.

Key tables: `player`, `logged_out_player`, `market_asset`, `market_news`,
`portfolio`, `firm`, `employee`, `property_catalog`, `owned_property`,
`vehicle_catalog`, `owned_vehicle`, `completed_quest`, `rich_list` (+ the
`rich_list_view` view, and the two scheduler tables).

## Client (TypeScript/React) — `client/src/`

- `App.tsx` — SpacetimeDB connection (env-driven), keyboard/mouse input, the
  20Hz game loop, and top-level state. Connection reads
  `VITE_SPACETIME_HOST` / `VITE_SPACETIME_DB`.
- `components/` — `GameScene`, `FinancialCity`, `Player`, `TradingTerminal`,
  `MentorChat` (calls `/api/mentor`), `NewsTicker`, `QuestLog`, `RichList`,
  `GameHUD`, `PlayerUI`, `JoinGameDialog`, `DebugPanel`.
- `services/AI_Market_Events.ts` — offline simulated news generator (labeled
  `simulated`) and the remix parser: tries `/api/remix`, falls back to a local
  keyword parser. **No LLM key exists in this bundle.**
- `simulation.ts` — load-test bots. Host/DB come from `SPACETIME_HOST`/`_DB`
  (or the `VITE_`-prefixed vars), defaulting to the same local-dev values as
  the client, so client + bots + deploy stay coherent.
- `generated/` — auto-generated SpacetimeDB bindings (do NOT edit by hand).

## AI proxy (`api/`) — Gemini key is server-side ONLY

- `mentor.ts` — `POST /api/mentor`: context-aware quant mentor. Rate-limited
  per IP; returns 503 when unconfigured so the client shows offline advice.
- `remix.ts` — `POST /api/remix`: parses a prompt into market parameters.
- `_lib/gemini.ts` — REST call to Gemini. Reads `GEMINI_API_KEY` (falls back to
  `GOOGLE_API_KEY`); model defaults to `gemini-flash-latest` (override with
  `GEMINI_MODEL`); thinking disabled so short answers aren't truncated.
- `_lib/ratelimit.ts` — in-memory per-instance sliding window.

**Never** add a `VITE_`-prefixed LLM key: Vite inlines those into the public
bundle. The key lives only in the serverless env (see `.env.example`).

## Configuration

- Module name is **`quant-link`** everywhere. Local dev host is
  **`127.0.0.1:3001`**; production is `maincloud.spacetimedb.com`.
- Client: `client/.env.example` → `VITE_SPACETIME_HOST`, `VITE_SPACETIME_DB`.
- Server proxy: root `.env.example` → `GEMINI_API_KEY` (or `GOOGLE_API_KEY`).

## Development Commands

```bash
# Server (from server/)
cargo test                              # native unit tests for sim_math (GBM/RNG/firm)
spacetime build                         # compile Rust -> WASM
spacetime start --listen-addr 127.0.0.1:3001
spacetime publish quant-link --server http://127.0.0.1:3001 --module-path . -c -y --anonymous
spacetime generate --lang typescript --out-dir ../client/src/generated --module-path .

# Client (from client/)
npm install
npm run dev                             # Vite dev server (localhost:5173)
npm run build                           # production build -> client/dist
npm run simulate            # load-test bots (SPACETIME_HOST/SPACETIME_DB env-driven)

# AI proxy: runs on Vercel. Locally, `vercel dev` serves /api, or set
# GEMINI_API_KEY / GOOGLE_API_KEY in the environment.
```

## Conventions & gotchas

- **SpacetimeDB v2 API**: table macro uses `accessor`; `ctx.sender()` is a
  method, `ctx.timestamp` a field; TS package is `spacetimedb`; connect with
  `withDatabaseName` + `withConfirmedReads(false)`; tables are property access
  (`conn.db.player`, no parens); reducers take a single object argument;
  **register table callbacks before subscribing** (backfill fires immediately).
- **Stale closures**: identity/localPlayer/connected are held in `useRef`
  because state captured in `useCallback` goes stale.
- **Client-side prediction** uses the real frame `dt`; speed constants must
  match the server (`PLAYER_SPEED = 7.5`).
- **Schema changes** (add/remove table columns) require delete + republish:
  `spacetime delete quant-link && spacetime publish quant-link`, then
  regenerate the client bindings.
- **Honesty**: ambient market news is a labeled `simulated` generator; GBM
  prices are a simulation, not real markets — keep that framing in UI/docs.
