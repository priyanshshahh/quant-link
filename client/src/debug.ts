/**
 * Debug logging gate.
 *
 * The game paths (player prediction, animation loading, the 20Hz send loop)
 * carry a lot of `console.*` calls that are invaluable while developing but
 * flood the console — and pay string-interpolation cost every frame — in a
 * shipped multiplayer session. Route those through `dlog`/`dwarn`/`derror` so
 * they only fire when debugging is enabled.
 *
 * Enabled when running the Vite dev server (`import.meta.env.DEV`) or when the
 * page URL carries a `?debug` query param, so a deployed build can be inspected
 * on demand without a rebuild.
 */
export const DEBUG: boolean =
  (typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)) ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug'));

/* eslint-disable @typescript-eslint/no-explicit-any */
export const dlog = (...args: any[]): void => {
  if (DEBUG) console.log(...args);
};

export const dwarn = (...args: any[]): void => {
  if (DEBUG) console.warn(...args);
};

export const derror = (...args: any[]): void => {
  if (DEBUG) console.error(...args);
};
