/**
 * POST /api/remix — parses a player's natural-language "market remix" prompt
 * into structured market parameters using Gemini, server-side. The client
 * falls back to its local keyword parser on any non-200, so this endpoint is
 * an optional quality upgrade, never a hard dependency.
 */

import { callGemini, GeminiNotConfiguredError } from './_lib/gemini';
import { rateLimit } from './_lib/ratelimit';
import { clientIp, type ApiRequest, type ApiResponse } from './_lib/types';

const MAX_PROMPT_CHARS = 300;
const RATE_LIMIT_PER_MIN = 6;
const TICKERS = ['AAPL', 'NVDA', 'TSLA', 'BTC', 'MSFT', 'GOOG', 'JPM', 'V', 'ALL'];

const REMIX_SYSTEM_PROMPT =
  'You parse a player prompt for a trading game into market parameters. ' +
  'Return ONLY compact JSON: {"ticker_impacted": string (one of AAPL,NVDA,TSLA,BTC,MSFT,GOOG,JPM,V or "ALL"), ' +
  '"drift_modifier": number (-0.5 bearish .. 0.5 bullish), "volatility_modifier": number (0..0.8), ' +
  '"news_headline": string (max 12 words)}.';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!rateLimit(`remix:${clientIp(req)}`, RATE_LIMIT_PER_MIN, 60_000)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    return;
  }

  const body = (req.body ?? {}) as { prompt?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
  if (!prompt) {
    res.status(400).json({ error: 'Missing "prompt" string' });
    return;
  }

  try {
    const text = await callGemini([REMIX_SYSTEM_PROMPT, prompt], 256);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Gemini response');
    const obj = JSON.parse(match[0]) as Record<string, unknown>;

    const ticker = String(obj.ticker_impacted ?? 'ALL').toUpperCase();
    res.status(200).json({
      ticker: TICKERS.includes(ticker) ? ticker : 'ALL',
      driftModifier: clamp(Number(obj.drift_modifier) || 0, -0.5, 0.5),
      volatilityModifier: clamp(Number(obj.volatility_modifier) || 0, -0.5, 0.8),
      headline: String(obj.news_headline ?? prompt).slice(0, 120),
    });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      res.status(503).json({ error: 'Remix AI not configured on this deployment' });
      return;
    }
    console.error('[api/remix]', err);
    res.status(502).json({ error: 'Remix AI is unavailable right now' });
  }
}
