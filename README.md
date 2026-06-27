# QuantLink — Real-Time Financial Simulation Game

A multiplayer 3D quantitative trading simulation built for the **SpacetimeDB Launchpad Hackathon**. Walk a financial metropolis, trade live markets powered by Geometric Brownian Motion, purchase luxury assets, and learn from an AI quant mentor.

## Stack

- **Backend**: SpacetimeDB 2.4 (Rust) — scheduled market ticks, atomic trades, portfolio state
- **Frontend**: React + Three.js (React Three Fiber) — 3D world + glassmorphic trading terminal
- **AI**: Google Gemini — context-aware financial mentorship

## Official Resources

- **Agent skills** (installed in `.agents/skills/`): [skills.sh/clockworklabs/spacetimedb](https://www.skills.sh/clockworklabs/spacetimedb)
  ```bash
  npx skills add clockworklabs/spacetimedb
  ```
- **Templates**: [spacetimedb.com/templates](https://spacetimedb.com/templates)
  - Launchpad-relevant: **Money Exchange React** (financial state), **Llm Chat** (LLM integration), **Chat React** (real-time subscriptions)
  - This project extends the community [3D Multiplayer starter](https://github.com/majidmanzarpour/vibe-coding-starter-pack-3d-multiplayer) with Rust server + trading mechanics

## Quick Start

### Prerequisites

- [SpacetimeDB CLI](https://spacetimedb.com/install)
- Rust + `wasm32-unknown-unknown` target
- Node.js 18+

### 1. Build the module

```bash
cd server
spacetime build
spacetime generate --lang typescript --out-dir ../client/src/generated --module-path .
```

### 2. Start SpacetimeDB

```bash
spacetime start --listen-addr 127.0.0.1:3001
```

Use port 3001 if 3000 is already taken.

### 3. Publish the module (new terminal)

```bash
cd server
spacetime publish quant-link --server http://127.0.0.1:3001 --module-path . -c -y --anonymous
```

### 4. Run the client

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

### 5. Optional: Gemini AI Mentor

```bash
cp client/.env.example client/.env
# Add your API key from https://aistudio.google.com/apikey
```

## Gameplay

| Action | How |
|--------|-----|
| Move | WASD + mouse look (click to lock pointer) |
| Open trading terminal | Walk to the blue brokerage tower, press **T** |
| Talk to AI mentor | Walk to the purple building (left side), press **E** |
| Buy/sell stocks | Use the Market tab in the terminal |
| Buy vehicles | Use the Lifestyle tab when you have enough cash |
| Upgrade knowledge | Portfolio tab — unlocks advanced concepts |

## Architecture Highlights

- **GBM market simulation** runs server-side via scheduled reducers every 2 seconds
- **All game state** lives in SpacetimeDB tables — no external database or message broker
- **Real-time sync** pushes price updates to all clients via subscriptions
- **Gemini RAG-style prompts** include live portfolio and market data

## Hackathon Deployment

```bash
spacetime login
spacetime publish quant-link
```

Set `VITE_SPACETIME_HOST` and `VITE_SPACETIME_DB` in production.

## License

MIT
