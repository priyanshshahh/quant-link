# QuantLink — Game Knowledge File

> **A GTA-style 3D open-world quant trading life-sim, built entirely on SpacetimeDB.**
> Walk a sunny Miami financial district, run a hedge fund, trade a live server-authoritative market, build a firm, buy real estate & cars, react to AI-generated breaking news, remix the market with natural language, and climb the global Rich List — all in real-time multiplayer.

- **Deploy target (pending owner login, not yet live):** Vercel `https://quantlink.vercel.app` + SpacetimeDB Maincloud database `quant-link`. Runs locally today (see README). See `docs/PROJECT-NOTES.md` for the deploy plan.
- **Stack:** React 19 + TypeScript + React Three Fiber (Three.js) client · Rust → WASM SpacetimeDB module

---

## 1. The Pitch (30 seconds)

Most "trading games" are spreadsheets with a chart. QuantLink is a **living 3D city** where the market is a shared, server-authoritative simulation. Every player you see is a real connection. The prices move on the server and stream to everyone at once. An **AI market wire** invents breaking-news shocks that violently move prices, you can **type a prompt to remix the market** ("crash oil, moon AI stocks"), and an **AI mentor** coaches your strategy. You spawn broke-ish with $100K and a Studio-Apartment firm; you grind objectives to become a Wall Street titan on the global leaderboard.

It is simultaneously a **Best Web App** (real-time multiplayer DB), a **Best Use of AI** (news generation, prompt-to-game remix, mentor), and a **Best Game** (open world, progression, quests).

---

## 2. Controls

| Input | Action |
|---|---|
| **W / A / S / D** | Move character |
| **Shift** | Sprint |
| **Mouse** | Look / steer (click the world once to lock the pointer) |
| **Mouse wheel** | Zoom camera in/out |
| **C** | Toggle camera (follow ⇄ orbital) |
| **T** | Open the **Trading Terminal** (near the Exchange) |
| **E** | Open the **AI Mentor** chat (near Senior Quant HQ) |
| **Q** | Open **Career Objectives** (quests) — or click the 🎯 button |
| **Esc** | Close any open panel |

**Where to go:** Spawn faces the city. **North = QuantLink Exchange** (trade). **West = Senior Quant HQ** (AI mentor). Other labeled towers (Luxury Motors, Ocean Penthouse, Crypto Vault, etc.) are flavor for the systems inside the Terminal's tabs.

---

## 3. Core Gameplay Loop

1. **Join** — pick a username + class (Wizard/Paladin avatar), spawn with **$100,000** cash and a tier-0 "Studio Apartment" firm.
2. **Trade** — open the Terminal (T), buy/sell assets. Prices update live for everyone.
3. **React** — the **AI Market Wire** drops breaking headlines every ~60s that jolt prices and volatility. Trade the news.
4. **Build a firm** — hire employees (alpha + reputation), buy property (passive rent), upgrade your firm tier.
5. **Flex** — buy vehicles and luxury real estate as lifestyle/wealth sinks.
6. **Complete objectives** (Q) — server-validated milestones pay cash bonuses.
7. **Climb the Rich List** — a server-computed top-5 leaderboard by net worth, updated every tick.

---

## 4. Systems Reference

### 4.1 Market simulation (server-authoritative)
- Assets live in the `market_asset` table (ticker, company, current/previous price, **volatility**, **drift**).
- Each market tick advances prices with **Geometric Brownian Motion** (drift + volatility × random shock), scaled by a realistic `dt` (`TICK_SECONDS / (252 × 6.5 × 3600)`).
- **Volatility mean-reverts** toward each asset's baseline so shocks spike then settle.
- Tickers include equities and crypto (e.g. **AAPL, MSFT, NVDA, GOOG, JPM, TSLA, BTC**, etc.) shown on the in-world ticker board and the bottom HUD strip.

### 4.2 Portfolio & net worth
- Positions stored per-player in `portfolio` (shares, average entry price).
- **Net worth = cash + Σ(shares × live price)**. Used for tiers, quests, and the Rich List.

### 4.3 Firm management
- `firm` table: name, **tier (0–3)**, reputation, AUM, regulatory risk, total profit.
- **Tiers:** Studio Apartment → Small Office → Trading Floor → Wall Street Tower (each needs net-worth + cash to upgrade).
- **Employees** (`employee`): roles **trader / researcher / compliance / engineer**, each with salary (per-tick drain), **alpha bonus** (passive portfolio gain), and reputation/regulatory effects. Headcount cap scales with firm tier.
- Each tick: rent + passive alpha − salaries = net cash flow; reputation drifts based on regulatory risk.

### 4.4 Real estate & vehicles
- `property_catalog` / `owned_property`: apartments, offices, penthouses, nightclub/marina stakes — gated by firm tier, generate **rent per tick** and reputation.
- `vehicle_catalog` / `owned_vehicle`: lifestyle purchases (wealth sink + objective).

### 4.5 Knowledge
- `upgrade_knowledge_level` reducer raises the player's `knowledge_level` (gates/flavor + an objective).

### 4.6 Rich List (leaderboard)
- The `game_tick` reducer ranks **all** players by net worth and writes the top 5 into `rich_list`.
- A public read-only `rich_list_view` exposes them (views can't iterate, so ranking is done in the tick and read by indexed rank). Rendered as a glassmorphic overlay; the local player is highlighted.

### 4.7 Career Objectives (quests) — server-validated
- 10 objectives tracked from live state with cash rewards: *First Blood, Diversify, Six Figures, Back to School, Build a Desk, Flex, Property Mogul, Team Builder, Moving Up, Whale.*
- Claiming calls `claim_quest_reward(quest_key)`, which **re-validates the condition server-side** and prevents double-claims via the `completed_quest` table — rewards are fully authoritative (no client cheating).
- The 🎯 button shows a pulsing badge counting rewards ready to claim.

---

## 5. AI Features

### 5.1 AI Market Wire (breaking news → market shocks)
- A connected client requests a headline + sentiment (−10…+10) every ~60s and calls the `apply_market_shock` reducer.
- The shock is written to the public `market_news` feed and **instantly jolts prices + volatility** for every connected trader, then plays out through the simulation.
- **Graceful degradation:** uses OpenAI (`VITE_OPENAI_API_KEY`) or Gemini (`VITE_GEMINI_API_KEY`) if a key is set, otherwise a high-quality **offline event simulator** keeps the wire alive with no key required. Headlines scroll in the top news ticker.

### 5.2 Prompt-to-Game Remix Engine
- In the Terminal's Market tab, type a natural-language prompt ("*hyperinflation hits, dump bonds*", "*AI mania, moon NVDA*").
- The client parses it (LLM if a key exists, else a local NLU parser) into structured params — `ticker, driftModifier, volatilityModifier, headline` — and calls `remix_market`, which mutates the live simulation for **everyone**.

### 5.3 AI Mentor
- Press **E** near Senior Quant HQ for a chat coach that grounds advice in your live portfolio + market state (Gemini-backed when a key is present, with sensible offline guidance otherwise).

---

## 6. Architecture

```
┌─────────────────────────── CLIENT (Vercel) ───────────────────────────┐
│  React 19 + TypeScript + Vite                                          │
│  React Three Fiber / Three.js  → 3D world (GameScene, FinancialCity,   │
│                                   Player w/ FBX models + animations)    │
│  UI: TradingTerminal, MentorChat, RichList, NewsTicker, QuestLog,      │
│      GameHUD, PlayerUI, DebugPanel                                      │
│  services/AI_Market_Events.ts → news + remix (LLM or offline)          │
│  generated/  → auto-generated SpacetimeDB bindings (DO NOT EDIT)        │
└───────────────▲───────────────────────────────────────────────────────┘
                │ WebSocket (subscriptions + reducer calls)
┌───────────────┴──────────────── SERVER (SpacetimeDB Maincloud) ────────┐
│  Rust module → WASM, database "quant-link"                              │
│  lib.rs        → tables, reducers, lifecycle, rich_list_view            │
│  market_logic  → GBM, shocks, remix, buy/sell, vehicles                 │
│  firm_logic    → firms, employees, property, rich list, net worth       │
│  quest_logic   → server-validated objective rewards                     │
│  player_logic  → movement integration, input application                │
└────────────────────────────────────────────────────────────────────────┘
```

**Data flow:** client input (20 Hz) → `update_player_input` reducer → server updates `player` → subscription pushes to all clients → R3F renders with client-side prediction + reconciliation. Market/firm ticks run on server schedules and stream out the same way.

### Key tables
`player`, `logged_out_player`, `market_asset`, `market_news`, `portfolio`, `firm`, `employee`, `property_catalog`, `owned_property`, `vehicle_catalog`, `owned_vehicle`, `rich_list` (+ `rich_list_view`), `completed_quest`, and the schedule tables `game_tick_schedule` / `market_tick_schedule`.

### Key reducers
`register_player`, `update_player_input`, `execute_trade`, `buy_vehicle`, `buy_property`, `hire_employee`, `upgrade_firm`, `upgrade_knowledge_level`, `apply_market_shock`, `remix_market`, `claim_quest_reward`, plus lifecycle (`init`, `identity_connected`, `identity_disconnected`) and scheduled (`game_tick`, `process_market_tick`).

---

## 7. Run / Deploy

### Local development
```bash
# Terminal 1 — server
cd server
spacetime start                      # local SpacetimeDB on :3000

# Terminal 2 — publish + bindings
cd server
spacetime build
spacetime publish vibe-multiplayer   # local; or: -s maincloud quant-link -y
spacetime generate --lang typescript --out-dir ../client/src/generated --module-path .

# Terminal 3 — client
cd client
npm install
npm run dev                          # http://localhost:5173
```
> To point the local client at the cloud DB instead, leave the defaults — `App.tsx` connects to `maincloud.spacetimedb.com` / `quant-link` unless `VITE_SPACETIME_HOST` / `VITE_SPACETIME_DB` are set.

### Deploy backend (Maincloud)
```bash
cd server
spacetime publish -s maincloud quant-link -y
spacetime generate --lang typescript --out-dir ../client/src/generated --module-path .
```

### Deploy frontend (Vercel)
```bash
cd client
npm run build
npx vercel --prod --yes              # → https://quantlink.vercel.app
```

### Optional AI keys (client/.env)
```
VITE_OPENAI_API_KEY=sk-...     # enables LLM news + remix + mentor
VITE_GEMINI_API_KEY=...        # alternative provider
```
Without keys, the AI systems run on the built-in offline simulator/parser — the game is fully playable with **no keys**.

### Load testing
```bash
cd client
npm run simulate -- 50 30      # 50 bot traders for 30s (point at the same DB)
```

---

## 8. Project Map

```
spacetime/
├── client/
│   ├── src/
│   │   ├── App.tsx                     # connection, subscriptions, input, game loop, AI events
│   │   ├── components/
│   │   │   ├── GameScene.tsx           # R3F canvas, daytime sky/lighting, clouds
│   │   │   ├── FinancialCity.tsx       # Miami district: towers, roads, cars, palms, beach, ticker
│   │   │   ├── Player.tsx              # FBX model, animations, prediction, camera (follow/orbital)
│   │   │   ├── TradingTerminal.tsx     # trade / firm / life tabs + AI remix bar
│   │   │   ├── MentorChat.tsx          # AI mentor
│   │   │   ├── RichList.tsx            # leaderboard overlay
│   │   │   ├── NewsTicker.tsx          # AI market wire ticker
│   │   │   ├── QuestLog.tsx            # career objectives panel
│   │   │   ├── GameHUD.tsx / PlayerUI.tsx / DebugPanel.tsx / JoinGameDialog.tsx
│   │   ├── services/AI_Market_Events.ts
│   │   └── generated/                  # auto-generated bindings
│   └── ...
├── server/src/
│   ├── lib.rs · market_logic.rs · firm_logic.rs · quest_logic.rs · player_logic.rs · common.rs
└── GAME_KNOWLEDGE.md                   # this file
```

---

## 9. Design Notes / Gotchas

- **Server is the source of truth.** Prices, trades, firm economics, quest rewards, and the leaderboard are all validated server-side; the client predicts movement and reconciles.
- **Register table callbacks before subscribing** — SpacetimeDB v2 fires backfill immediately on `.subscribe()`.
- **Views can't iterate.** The Rich List ranking is computed in the `game_tick` reducer and exposed via an indexed `rich_list_view`.
- **No-key AI by design.** Judges/players don't need API keys; LLMs are an optional upgrade, not a dependency.
- **Net worth** drives tiers, the Whale/Six-Figures objectives, and Rich List rank — it's the single most important number in the game.
