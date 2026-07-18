/**
 * POST /api/mentor — server-side proxy for the in-game Senior Quant mentor.
 *
 * The client sends its (already public, game-state) context plus the trader's
 * question; the Gemini call happens here so the API key never reaches the
 * browser. Rate limited per IP. Returns 503 when no key is configured so the
 * client can fall back to its offline heuristic advice.
 */

import { callGemini, GeminiNotConfiguredError } from './_lib/gemini';
import { rateLimit } from './_lib/ratelimit';
import { clientIp, type ApiRequest, type ApiResponse } from './_lib/types';

const MAX_QUESTION_CHARS = 500;
// Raised from 2000 to fit the richer portfolio snapshot (net worth, aggregate
// P&L, concentration, firm, regime) the client now sends so advice is grounded.
const MAX_CONTEXT_CHARS = 3000;
const RATE_LIMIT_PER_MIN = 10;

const MENTOR_SYSTEM_PROMPT =
  'You are an elite quantitative trader mentoring a junior trader in a virtual ' +
  'financial metropolis (a simulation game — all prices are simulated via ' +
  'geometric Brownian motion, not real markets). You are given a live SNAPSHOT ' +
  'of the trader\'s actual holdings, cash, net worth, unrealized P&L, largest-' +
  'position concentration, firm, and the current market regime — ground your ' +
  'advice in those specifics (e.g. call out concentration risk or a losing ' +
  'position by name). Teach concepts like diversification, volatility, beta, ' +
  'position sizing, and Black-Scholes when relevant. Keep responses under 120 ' +
  'words, sharp and educational. Never give real-world financial advice.';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!rateLimit(`mentor:${clientIp(req)}`, RATE_LIMIT_PER_MIN, 60_000)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    return;
  }

  const body = (req.body ?? {}) as { question?: unknown; context?: unknown };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';

  if (!question) {
    res.status(400).json({ error: 'Missing "question" string' });
    return;
  }

  try {
    const reply = await callGemini([
      MENTOR_SYSTEM_PROMPT,
      `Trader game state:\n${context.slice(0, MAX_CONTEXT_CHARS)}`,
      `Trader asks: ${question.slice(0, MAX_QUESTION_CHARS)}`,
    ]);
    res.status(200).json({ reply });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      res.status(503).json({ error: 'Mentor AI not configured on this deployment' });
      return;
    }
    console.error('[api/mentor]', err);
    res.status(502).json({ error: 'Mentor AI is unavailable right now' });
  }
}
