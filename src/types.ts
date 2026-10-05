/**
 * Public API. VERIFIED: the core has no renderer, Node or native imports.
 * Browser-only structural contracts keep renderer/native dependencies out of the core.
 */
export type JsonValue = null | boolean | number | string
  | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type Disposer = () => void;
export type MaybePromise<T> = T | Promise<T>;
export type RouterMode = 'history' | 'hash';
export type NavigationCause = 'initial' | 'programmatic' | 'link' | 'traverse'
  | 'hashchange' | 'native' | 'render';
export type QueryEntries = readonly (readonly [string, string])[];

export interface RouteDefinition {
  readonly id: string;
  /** Base-relative pattern. First registered match wins. */
  readonly path: string;
}

/** Immutable snapshot. Logical route fields are distinct from the physical page URL. */
export interface RouteRequest {
  readonly match: boolean;
  readonly routeId: string | null;
  readonly matchedRoute: string | null;
  /** Canonical physical HTTP(S) page URL; includes the encoded route in hash mode. */
  readonly href: string;
  readonly origin: string;
  /** Physical page pathname, including basePath. In hash mode, this is the shell pathname. */
  readonly pathname: string;
  /** Logical, base-relative route path; encoded until individual params are extracted. */
  readonly path: string;
  /** Logical route query, including '?' when nonempty. */
  readonly search: string;
  /** Logical route anchor, including '#' when nonempty; not a generic key/value map. */
  readonly hash: string;
  /** Once-decoded route data. An encoded separator never becomes route structure. */
  readonly params: Readonly<Record<string, string>>;
  /** Preserves duplicate keys and order. */
  readonly query: QueryEntries;
}

export type RouterErrorCode = 'invalid-url' | 'invalid-encoding' | 'invalid-route'
  | 'outside-origin' | 'outside-base' | 'outside-shell' | 'invalid-state'
  | 'not-started' | 'already-owned' | 'destroyed' | 'guard-error'
  | 'prepare-error' | 'commit-error' | 'effect-error' | 'unowned-history' | 'history-error';

/** Serializable diagnostics; do not put credentials or full native-link queries in logs. */
export interface RouterError {
  readonly code: RouterErrorCode;
  readonly message: string;
}

/** resolve()/href() throw this for invalid explicit input; navigate() returns rejected. */
export { RouterInputError } from './errors.js';

export interface RouterSnapshot {
  readonly phase: 'idle' | 'preparing' | 'committing' | 'error' | 'destroyed';
  /** During commit, location may already have changed while DOM rendering is in progress. */
  readonly current: RouteRequest | null;
  readonly pending: RouteRequest | null;
  readonly intentId: number;
  readonly entryKey: string | null;
  readonly historyOwnership: 'owned' | 'unowned';
  readonly state: JsonValue;
  readonly error: RouterError | null;
}

export interface NavigationContext {
  readonly to: RouteRequest;
  readonly from: RouteRequest | null;
  readonly cause: NavigationCause;
  readonly intentId: number;
  readonly signal: AbortSignal;
  readonly state: JsonValue;
}

export type NavigationGuard = (context: NavigationContext) => MaybePromise<boolean | void>;

/** Preparation may allocate detached DOM/resources but must not mutate a live outlet. */
export interface PreparedView {
  /** Commits are serialized. Once begun, arbitrary user DOM work is not rollbackable. */
  commit(): MaybePromise<void>;
  beforeLeave?: NavigationGuard;
  /** Called once when abandoned or after this committed scope leaves. Idempotence is recommended. */
  dispose?: () => MaybePromise<void>;
}

export interface RouterCallbacks {
  prepare?: (context: NavigationContext) => MaybePromise<PreparedView>;
  /** Application focus/title/aria effects. Must respect cause and existing user focus. */
  afterCommit?: (context: NavigationContext) => MaybePromise<void>;
  onError?: (error: RouterError, snapshot: RouterSnapshot) => void;
}

export interface RouterConfig extends RouterCallbacks {
  readonly routes: readonly RouteDefinition[];
  readonly mode?: RouterMode;
  readonly basePath?: string;
  /** Base for relative resolution before start or without a Window; HTTP(S) only. */
  readonly baseUrl?: string;
  /** Resolved lazily at start; construction/import must not attach browser listeners. */
  readonly window?: Window;
  /** Auto restores owned-entry scroll and handles route anchors; manual disables those effects. */
  readonly scroll?: 'auto' | 'manual';
}

export interface HrefTarget {
  readonly id: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: QueryEntries;
  /** Unencoded anchor text without '#'. The builder performs encoding. */
  readonly hash?: string;
}

export interface NavigateOptions {
  readonly replace?: boolean;
  readonly state?: JsonValue;
  readonly cause?: 'programmatic' | 'native';
}

export type NavigationResult =
  | { readonly status: 'committed'; readonly intentId: number; readonly request: RouteRequest }
  | { readonly status: 'unchanged'; readonly intentId: number; readonly request: RouteRequest }
  | { readonly status: 'blocked'; readonly intentId: number; readonly request: RouteRequest;
      readonly veto: 'before-write' | 'owned-history-restored' }
  | { readonly status: 'superseded'; readonly intentId: number }
  | { readonly status: 'rejected'; readonly intentId: number; readonly error: RouterError }
  | { readonly status: 'error'; readonly intentId: number; readonly error: RouterError;
      readonly commitStarted: boolean };

export interface LinkOptions {
  /** Default: a[data-router-link]. Merely matching this selector does not bypass native-link checks. */
  readonly selector?: string;
}

export interface Router {
  /** Idempotent. Explicit initialHref replaces, rather than pushes, the adopted initial entry. */
  start(initialHref?: string): Promise<NavigationResult>;
  /** Settles with the initial start result, or a destroyed result if torn down before start. */
  ready(): Promise<NavigationResult>;
  /** No current-state mutation. Relative input uses baseHref, committed URL, baseUrl or explicit Window. */
  resolve(href: string, baseHref?: string): RouteRequest;
  /** Named builder is portable across history/hash/basePath; validates all required parameters. */
  href(target: HrefTarget): string;
  navigate(href: string, options?: NavigateOptions): Promise<NavigationResult>;
  getSnapshot(): RouterSnapshot;
  /** No immediate implicit callback; call getSnapshot() for the initial value. */
  subscribe(listener: (snapshot: RouterSnapshot) => void): Disposer;
  beforeEach(guard: NavigationGuard): Disposer;
  attachLinks(root: Document | Element | ShadowRoot, options?: LinkOptions): Disposer;
  /** Only callbacks can be reconfigured; structural routing changes need a new router instance. */
  config(callbacks: RouterCallbacks): void;
  /** Reproduce current screen without pushing/replacing history or running navigation guards. */
  render(): Promise<NavigationResult>;
  /** Stops listeners immediately, then awaits in-progress commit and deterministic disposal. */
  destroy(): Promise<void>;
}


