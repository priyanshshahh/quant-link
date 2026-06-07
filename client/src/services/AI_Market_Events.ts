/**
 * AI Market Events Generator
 * --------------------------------------------------------------------------
 * Acts as a background "financial news simulator". Every cycle it produces a
 * breaking-news headline plus a sentiment score from -10 (crash) to +10
 * (rally). The score is fed into the SpacetimeDB `apply_market_shock` reducer,
 * which swings live market prices for every connected trader.
 *
 * Provider strategy (graceful degradation):
 *   1. VITE_OPENAI_API_KEY  -> OpenAI Chat Completions (fetch, no SDK needed)
 *   2. VITE_GEMINI_API_KEY  -> Gemini (reuses the @google/generative-ai dep)
 *   3. No key               -> high-quality offline simulator (default)
 *
 * The offline simulator is deliberately rich so the demo always feels alive
 * even with zero API keys configured.
 */

export interface MarketEvent {
  headline: string;
  sentiment: number; // -10 .. +10
  source: 'openai' | 'gemini' | 'simulated';
}

const TICKERS = ['AAPL', 'NVDA', 'TSLA', 'BTC', 'MSFT', 'GOOG', 'JPM', 'V'];

// Templated headlines grouped by sentiment band. {T} is replaced with a ticker.
const BULLISH = [
  '{T} smashes earnings, guidance raised across the board',
  'Fed signals surprise rate cut — risk assets rip higher',
  '{T} unveils blockbuster AI chip, orders backlogged for years',
  'Institutional whales pile into {T}, volume hits record',
  'Breakthrough product launch sends {T} to all-time highs',
  'Short squeeze ignites as {T} bears capitulate',
];
const BEARISH = [
  'SEC opens formal probe into {T} accounting practices',
  '{T} misses badly, slashes full-year outlook',
  'Liquidity crunch spooks markets — {T} leads the selloff',
  'Surprise hot inflation print hammers growth names like {T}',
  'Regulators threaten antitrust breakup of {T}',
  'Flash crash: {T} circuit breakers triggered on heavy selling',
];
const NEUTRAL = [
  '{T} trades flat as traders await CPI data',
  'Mixed signals: {T} options imply elevated volatility',
  'Analysts split on {T} after sideways quarter',
  'Markets digest {T} headlines, awaiting next catalyst',
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randTicker = () => pick(TICKERS);

function simulatedEvent(): MarketEvent {
  // Bias slightly toward action (non-neutral) so the market keeps moving.
  const roll = Math.random();
  let band: string[];
  let sentiment: number;
  if (roll < 0.42) {
    band = BULLISH;
    sentiment = 4 + Math.floor(Math.random() * 7); // +4 .. +10
  } else if (roll < 0.84) {
    band = BEARISH;
    sentiment = -(4 + Math.floor(Math.random() * 7)); // -4 .. -10
  } else {
    band = NEUTRAL;
    sentiment = Math.floor(Math.random() * 5) - 2; // -2 .. +2
  }
  const headline = pick(band).replace('{T}', randTicker());
  return { headline, sentiment, source: 'simulated' };
}

const SYSTEM_PROMPT =
  'You are a financial news simulator for a trading game. Generate ONE short, ' +
  'punchy breaking-news headline (max 12 words) about a fictional-but-realistic ' +
  'market event, and a sentiment score from -10 (market crash) to 10 (massive rally). ' +
  'Respond ONLY as compact JSON: {"headline": string, "sentiment": number}.';

function clampSentiment(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  if (Number.isNaN(v)) return 0;
  return Math.max(-10, Math.min(10, Math.round(v)));
}

function parseEventJson(text: string): { headline: string; sentiment: number } | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    if (typeof obj.headline !== 'string') return null;
    return { headline: obj.headline.slice(0, 120), sentiment: clampSentiment(obj.sentiment) };
  } catch {
    return null;
  }
}

async function fromOpenAI(apiKey: string): Promise<MarketEvent> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 1.0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Generate the next breaking market event.' },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = parseEventJson(data?.choices?.[0]?.message?.content ?? '');
  if (!parsed) throw new Error('OpenAI parse failed');
  return { ...parsed, source: 'openai' };
}

async function fromGemini(apiKey: string): Promise<MarketEvent> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent([{ text: SYSTEM_PROMPT }, { text: 'Generate the next breaking market event.' }]);
  const parsed = parseEventJson(result.response.text());
  if (!parsed) throw new Error('Gemini parse failed');
  return { ...parsed, source: 'gemini' };
}

// ===========================================================================
// PROMPT-TO-GAME "REMIX" ENGINE
// Parses a player's natural-language prompt into structured market parameters
// that drive the SpacetimeDB `remix_market` reducer. Uses an LLM if a key is
// configured, otherwise a robust local keyword parser (so demos always work).
// ===========================================================================

export interface RemixParams {
  ticker: string; // specific symbol or "ALL"
  driftModifier: number; // -0.5 .. 0.5 (trend + instant jolt)
  volatilityModifier: number; // -0.5 .. 0.8 (turbulence)
  headline: string;
  source: 'openai' | 'gemini' | 'parsed';
}

const TICKER_KEYWORDS: Record<string, string[]> = {
  AAPL: ['apple', 'aapl', 'iphone'],
  NVDA: ['nvidia', 'nvda', 'gpu', 'chip', 'ai chip', 'semiconductor'],
  TSLA: ['tesla', 'tsla', 'ev', 'electric vehicle', 'musk'],
  BTC: ['bitcoin', 'btc', 'crypto', 'cryptocurrency'],
  MSFT: ['microsoft', 'msft', 'azure'],
  GOOG: ['google', 'goog', 'alphabet', 'search'],
  JPM: ['jpmorgan', 'jpm', 'bank', 'banking', 'financials'],
  V: ['visa', 'payments', 'card'],
};

const POSITIVE_WORDS = ['rally', 'surge', 'squeeze', 'short squeeze', 'boom', 'soar', 'moon', 'bullish', 'breakthrough', 'pump', 'spike up', 'rip', 'melt up', 'green'];
const NEGATIVE_WORDS = ['crash', 'plunge', 'collapse', 'sell-off', 'selloff', 'recession', 'crisis', 'probe', 'fraud', 'ban', 'bearish', 'dump', 'tank', 'meltdown', 'red', 'panic', 'default'];
const VOLATILE_WORDS = ['volatility', 'volatile', 'chaos', 'swing', 'turbulence', 'turbulent', 'wild', 'uncertainty', 'whipsaw', 'supply chain'];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function localParseRemix(prompt: string): RemixParams {
  const p = prompt.toLowerCase();

  // Detect ticker (sector keywords too). Default to whole market.
  let ticker = 'ALL';
  for (const [sym, words] of Object.entries(TICKER_KEYWORDS)) {
    if (words.some((w) => p.includes(w))) { ticker = sym; break; }
  }
  if (p.includes('tech') && ticker === 'ALL') ticker = 'NVDA';

  // Sentiment direction + intensity.
  const posHits = POSITIVE_WORDS.filter((w) => p.includes(w)).length;
  const negHits = NEGATIVE_WORDS.filter((w) => p.includes(w)).length;
  const volHits = VOLATILE_WORDS.filter((w) => p.includes(w)).length;

  let drift = 0;
  if (posHits > negHits) drift = clamp(0.12 + posHits * 0.05, 0.1, 0.3);
  else if (negHits > posHits) drift = clamp(-(0.12 + negHits * 0.05), -0.3, -0.1);
  else drift = 0;

  // Intensifiers.
  if (/\b(massive|huge|global|severe|extreme|violent)\b/.test(p)) {
    drift = clamp(drift * 1.5, -0.4, 0.4);
  }

  const volatility = clamp(0.12 + volHits * 0.18 + Math.abs(drift) * 0.4, 0.08, 0.6);

  const dir = drift > 0.02 ? '📈' : drift < -0.02 ? '📉' : '◆';
  const scope = ticker === 'ALL' ? 'markets' : ticker;
  const headline = `${dir} REMIX: ${prompt.trim().slice(0, 90)} — ${scope} react`;

  return { ticker, driftModifier: Number(drift.toFixed(3)), volatilityModifier: Number(volatility.toFixed(3)), headline, source: 'parsed' };
}

const REMIX_SYSTEM_PROMPT =
  'You parse a player prompt for a trading game into market parameters. ' +
  'Return ONLY compact JSON: {"ticker_impacted": string (one of AAPL,NVDA,TSLA,BTC,MSFT,GOOG,JPM,V or "ALL"), ' +
  '"drift_modifier": number (-0.5 bearish .. 0.5 bullish), "volatility_modifier": number (0..0.8), "news_headline": string (max 12 words)}.';

async function remixFromLLM(prompt: string, openaiKey?: string, geminiKey?: string): Promise<RemixParams | null> {
  let text = '';
  try {
    if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          messages: [
            { role: 'system', content: REMIX_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      text = (await res.json())?.choices?.[0]?.message?.content ?? '';
    } else if (geminiKey) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const model = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent([{ text: REMIX_SYSTEM_PROMPT }, { text: prompt }]);
      text = result.response.text();
    } else {
      return null;
    }
  } catch (err) {
    console.warn('[Remix] LLM parse failed, falling back to local parser:', err);
    return null;
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const source: RemixParams['source'] = openaiKey ? 'openai' : 'gemini';
    return {
      ticker: String(obj.ticker_impacted ?? 'ALL').toUpperCase(),
      driftModifier: clamp(Number(obj.drift_modifier) || 0, -0.5, 0.5),
      volatilityModifier: clamp(Number(obj.volatility_modifier) || 0, -0.5, 0.8),
      headline: String(obj.news_headline ?? prompt).slice(0, 120),
      source,
    };
  } catch {
    return null;
  }
}

export async function parseRemixPrompt(prompt: string): Promise<RemixParams> {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (openaiKey || geminiKey) {
    const llm = await remixFromLLM(prompt, openaiKey, geminiKey);
    if (llm) return llm;
  }
  return localParseRemix(prompt);
}

export async function generateMarketEvent(): Promise<MarketEvent> {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  try {
    if (openaiKey) return await fromOpenAI(openaiKey);
    if (geminiKey) return await fromGemini(geminiKey);
  } catch (err) {
    console.warn('[AI Market Events] LLM call failed, using simulator:', err);
  }
  return simulatedEvent();
}
