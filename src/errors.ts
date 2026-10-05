/** Typed input failures intentionally omit potentially credential-bearing URLs. */
import type { RouterError, RouterErrorCode } from './types.js';
export class RouterInputError extends Error {
  override readonly name = 'RouterInputError';
  constructor(readonly code: RouterErrorCode, message: string) { super(message); }
}
export function input(code: RouterErrorCode, message: string): never {
  throw new RouterInputError(code, message);
}
export function diagnostic(error: unknown, fallback: RouterErrorCode): RouterError {
  return Object.freeze(error instanceof RouterInputError
    ? { code: error.code, message: error.message }
    : { code: fallback, message: `${fallback}: application callback or browser operation failed` });
}
export function encoding(value: string): string {
  try { return decodeURIComponent(value); }
  catch { return input('invalid-encoding', 'Malformed percent encoding or UTF-8'); }
}
