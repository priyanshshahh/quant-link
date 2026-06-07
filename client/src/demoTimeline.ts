/**
 * QuantLink — 3-minute auto-play demo timeline (?demo=1)
 *
 * Open https://quantlink.vercel.app/?demo=1, hit screen-record, and let it run.
 * Captions explain every system; actions drive the real game state.
 */

import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { DbConnection } from './generated';
import { InputState } from './generated/types';

export const DEMO_DURATION_MS = 180_000; // exactly 3 minutes

export interface DemoContext {
  conn: DbConnection | null;
  input: InputState;
  playerRotationRef: MutableRefObject<THREE.Euler>;
  setCaption: (text: string) => void;
  setShowTerminal: (v: boolean) => void;
  setShowMentor: (v: boolean) => void;
  setShowQuests: (v: boolean) => void;
  intervals: ReturnType<typeof setInterval>[];
}

interface DemoStep {
  at: number;
  caption: string;
  action?: (ctx: DemoContext) => void;
}

function pan(ctx: DemoContext, speed = 0.0014) {
  const id = setInterval(() => { ctx.playerRotationRef.current.y += speed; }, 16);
  ctx.intervals.push(id);
  return id;
}

function walk(ctx: DemoContext, opts: { forward?: boolean; left?: boolean; sprint?: boolean }) {
  ctx.input.forward = opts.forward ?? false;
  ctx.input.left = opts.left ?? false;
  ctx.input.sprint = opts.sprint ?? false;
}

function stop(ctx: DemoContext) {
  ctx.input.forward = false;
  ctx.input.backward = false;
  ctx.input.left = false;
  ctx.input.right = false;
  ctx.input.sprint = false;
}

function pickTicker(ctx: DemoContext, preferred: string): string {
  if (!ctx.conn) return preferred;
  const assets = [...ctx.conn.db.market_asset.iter()];
  return assets.find((a) => a.ticker === preferred)?.ticker ?? assets[0]?.ticker ?? preferred;
}

/** Full 3-minute scripted tour — every caption + action fits within 180s. */
export const DEMO_STEPS: DemoStep[] = [
  // ACT 1 — HOOK & WORLD (0:00–0:28)
  { at: 0, caption: 'QuantLink', action: (ctx) => pan(ctx) },
  { at: 3_500, caption: 'A GTA-style 3D quant-trading life-sim' },
  { at: 8_000, caption: 'Built on SpacetimeDB — the database IS your game server' },
  { at: 13_000, caption: 'A live neon city — every trader shares the same market' },
  { at: 18_000, caption: 'Spawn with $100K cash · Studio-tier hedge fund · live HUD' },
  { at: 23_000, caption: 'Prices stream in real time via WebSocket subscriptions' },

  // ACT 2 — CONTROLS & MOVEMENT (0:28–0:42)
  { at: 28_000, caption: 'WASD move · Shift sprint · Mouse look · T trade · E mentor · Q quests' },
  {
    at: 33_000,
    caption: 'Walk north → QuantLink Exchange',
    action: (ctx) => { ctx.intervals.forEach(clearInterval); ctx.intervals.length = 0; walk(ctx, { forward: true, sprint: true }); },
  },
  {
    at: 42_000,
    caption: 'Press T — open the Trading Terminal',
    action: (ctx) => { stop(ctx); ctx.setShowTerminal(true); },
  },

  // ACT 3 — TRADING (0:42–1:06)
  { at: 45_000, caption: 'Buy & sell — every trade hits a server reducer, not client state' },
  {
    at: 48_000,
    caption: 'Buy NVDA — server validates cash, updates your portfolio',
    action: (ctx) => ctx.conn?.reducers.executeTrade({ ticker: pickTicker(ctx, 'NVDA'), shares: 8, isBuy: true }),
  },
  {
    at: 54_000,
    caption: 'Diversify into BTC — equities + crypto in one portfolio',
    action: (ctx) => ctx.conn?.reducers.executeTrade({ ticker: pickTicker(ctx, 'BTC'), shares: 0.15, isBuy: true }),
  },
  { at: 60_000, caption: 'Net worth = cash + live portfolio value — updates instantly' },
  { at: 66_000, caption: 'Geometric Brownian Motion + volatility mean-reversion on the server' },

  // ACT 4 — AI SYSTEMS (1:06–1:34)
  {
    at: 72_000,
    caption: 'AI MARKET WIRE — breaking news shocks prices for ALL players',
    action: (ctx) => {
      ctx.setShowTerminal(false);
      ctx.conn?.reducers.applyMarketShock({
        headline: 'BREAKING: Fed signals surprise rate cut — risk assets rip higher',
        sentiment: 7,
      });
    },
  },
  { at: 78_000, caption: 'apply_market_shock reducer — sentiment jolts volatility + prices' },
  {
    at: 84_000,
    caption: 'PROMPT-TO-GAME REMIX — natural language reshapes the live market',
    action: (ctx) => ctx.conn?.reducers.remixMarket({
      ticker: 'NVDA',
      driftModifier: 0.5,
      volatilityModifier: 0.6,
      headline: 'AI mania: whales pile into NVDA as chip demand explodes',
    }),
  },
  { at: 90_000, caption: 'remix_market — your words change drift & volatility for everyone' },

  // ACT 5 — FIRM & LIFESTYLE (1:34–1:58)
  {
    at: 96_000,
    caption: 'Build your firm — hire traders for alpha, researchers for edge',
    action: (ctx) => ctx.conn?.reducers.hireEmployee({ role: 'trader' }),
  },
  { at: 102_000, caption: 'Employees cost salary per tick but boost passive gains' },
  {
    at: 108_000,
    caption: 'Real estate: offices, penthouses — passive rent every tick',
    action: (ctx) => ctx.conn?.reducers.buyProperty({ propertyKey: 'studio' }),
  },
  {
    at: 114_000,
    caption: 'Buy a vehicle — lifestyle wealth sink in the open world',
    action: (ctx) => ctx.conn?.reducers.buyVehicle({ vehicleKey: 'coupe' }),
  },

  // ACT 6 — MENTOR & QUESTS (1:58–2:20)
  {
    at: 120_000,
    caption: 'AI MENTOR (E) — coaching grounded in your live portfolio',
    action: (ctx) => ctx.setShowMentor(true),
  },
  {
    at: 126_000,
    caption: 'Gemini-powered · smart offline fallbacks when no API key',
    action: (ctx) => ctx.setShowMentor(false),
  },
  {
    at: 130_000,
    caption: 'CAREER OBJECTIVES (Q) — 10 quests, server-validated rewards',
    action: (ctx) => ctx.setShowQuests(true),
  },
  {
    at: 136_000,
    caption: 'Claim rewards only when conditions are met — no cheating',
    action: (ctx) => ctx.conn?.reducers.claimQuestReward({ questKey: 'first_trade' }),
  },
  {
    at: 142_000,
    caption: 'Grind objectives: intern → titan',
    action: (ctx) => ctx.setShowQuests(false),
  },

  // ACT 7 — LEADERBOARD & MULTIPLAYER (2:20–2:38)
  { at: 148_000, caption: 'RICH LIST — top 5 players ranked by net worth every server tick' },
  {
    at: 154_000,
    caption: 'Real-time multiplayer — other traders in the same 3D world',
    action: (ctx) => pan(ctx, 0.001),
  },

  // ACT 8 — ARCHITECTURE & CLOSE (2:38–3:00)
  { at: 160_000, caption: 'Rust WASM on SpacetimeDB Maincloud · React Three Fiber on Vercel' },
  { at: 166_000, caption: 'Tables · reducers · subscriptions · views — one unified backend' },
  { at: 172_000, caption: 'Best Web App · Best Use of AI · Best Game · Built Solo' },
  { at: 176_000, caption: 'quantlink.vercel.app · github.com/priyanshshahh/quant-link' },
  { at: 179_000, caption: 'QuantLink — thank you for watching' },
  {
    at: DEMO_DURATION_MS,
    caption: '',
    action: (ctx) => {
      stop(ctx);
      ctx.intervals.forEach(clearInterval);
      ctx.setCaption('');
    },
  },
];

/** Schedule every demo step; returns cleanup. */
export function runDemoTimeline(ctx: DemoContext): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const step of DEMO_STEPS) {
    timers.push(setTimeout(() => {
      if (step.caption) ctx.setCaption(step.caption);
      step.action?.(ctx);
    }, step.at));
  }

  return () => {
    timers.forEach(clearTimeout);
    ctx.intervals.forEach(clearInterval);
    stop(ctx);
    ctx.setShowTerminal(false);
    ctx.setShowMentor(false);
    ctx.setShowQuests(false);
    ctx.setCaption('');
  };
}
