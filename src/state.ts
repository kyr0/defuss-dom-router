/** Own JSON state is copied/frozen; foreign browser state is never fed through this codec. */
import { input } from './errors.js';
import type { JsonValue } from './types.js';
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype) return true;
  // Native structured clones from another Window have that realm's Object.prototype.
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'constructor');
  return Object.getPrototypeOf(proto) === null && typeof descriptor?.value === 'function' && descriptor.value.name === 'Object';
}
export function jsonState(value: unknown, parents = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (typeof value !== 'object' || !value) return input('invalid-state', 'State must contain only finite JSON values');
  if (parents.has(value)) return input('invalid-state', 'State must not contain cycles');
  if (!Array.isArray(value) && !isPlainRecord(value))
    return input('invalid-state', 'State must contain plain objects or arrays');
  if (Object.getOwnPropertySymbols(value).length) return input('invalid-state', 'State must not contain symbol keys');
  parents.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) return input('invalid-state', 'State arrays must be dense without extra properties');
      const out: JsonValue[] = [];
      for (let i = 0; i < value.length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d || !('value' in d)) return input('invalid-state', 'State must not contain accessors');
        out.push(jsonState(d.value, parents));
      }
      return Object.freeze(out);
    }
    const out: Record<string, JsonValue> = Object.create(null);
    for (const k of Object.keys(value).sort()) {
      const d = Object.getOwnPropertyDescriptor(value, k)!;
      if (!('value' in d)) return input('invalid-state', 'State must not contain accessors');
      out[k] = jsonState(d.value, parents);
    }
    return Object.freeze(out);
  } finally { parents.delete(value); }
}
export const sameState = (a: JsonValue, b: JsonValue): boolean => JSON.stringify(a) === JSON.stringify(b);
