/**
 * Minimal request/response typings for Vercel Node serverless functions.
 * Declared locally so the api/ directory has zero npm dependencies —
 * Vercel compiles these files with its built-in esbuild pipeline.
 */

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for). */
export function clientIp(req: ApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  if (first) return first.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
