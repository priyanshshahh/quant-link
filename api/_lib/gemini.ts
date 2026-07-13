/**
 * Server-side Gemini client. The API key lives ONLY in the serverless
 * runtime env (GEMINI_API_KEY) — it is never shipped in the browser bundle.
 * Uses the plain REST API via fetch so the function has zero npm deps.
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not configured');
  }
}

export async function callGemini(parts: string[], maxOutputTokens = 512): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiNotConfiguredError();

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: parts.map((text) => ({ text })) }],
      generationConfig: { maxOutputTokens, temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('Gemini returned an empty response');
  return text.trim();
}
