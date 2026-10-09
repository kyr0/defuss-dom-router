class RouterInputError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
  name = "RouterInputError";
}
function input(code, message) {
  throw new RouterInputError(code, message);
}
function diagnostic(error, fallback) {
  return Object.freeze(error instanceof RouterInputError ? { code: error.code, message: error.message } : { code: fallback, message: `${fallback}: application callback or browser operation failed` });
}
function encoding(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return input("invalid-encoding", "Malformed percent encoding or UTF-8");
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype) return true;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "constructor");
  return Object.getPrototypeOf(proto) === null && typeof descriptor?.value === "function" && descriptor.value.name === "Object";
}
function jsonState(value, parents = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (typeof value !== "object" || !value) return input("invalid-state", "State must contain only finite JSON values");
  if (parents.has(value)) return input("invalid-state", "State must not contain cycles");
  if (!Array.isArray(value) && !isPlainRecord(value))
    return input("invalid-state", "State must contain plain objects or arrays");
  if (Object.getOwnPropertySymbols(value).length) return input("invalid-state", "State must not contain symbol keys");
  parents.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) return input("invalid-state", "State arrays must be dense without extra properties");
      const out2 = [];
      for (let i = 0; i < value.length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d || !("value" in d)) return input("invalid-state", "State must not contain accessors");
        out2.push(jsonState(d.value, parents));
      }
      return Object.freeze(out2);
    }
    const out = /* @__PURE__ */ Object.create(null);
    for (const k of Object.keys(value).sort()) {
      const d = Object.getOwnPropertyDescriptor(value, k);
      if (!("value" in d)) return input("invalid-state", "State must not contain accessors");
      out[k] = jsonState(d.value, parents);
    }
    return Object.freeze(out);
  } finally {
    parents.delete(value);
  }
}
const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HISTORY_KEY = "__defuss_dom_router_v1";
const OWNER = /* @__PURE__ */ Symbol.for("defuss-dom-router.owner.v1");
function record(value) {
  return isPlainRecord(value);
}
function readEntry(raw, href) {
  if (!record(raw) || !Object.hasOwn(raw, HISTORY_KEY)) return null;
  const m = raw[HISTORY_KEY];
  if (!record(m) || m.library !== "defuss-dom-router" || m.version !== 1 || m.href !== href || typeof m.session !== "string" || !m.session || typeof m.key !== "string" || !m.key || typeof m.index !== "number" || !Number.isSafeInteger(m.index) || m.index < 0 || !Array.isArray(m.scroll) || m.scroll.length !== 2 || m.scroll.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  try {
    return { library: "defuss-dom-router", version: 1, href, key: m.key, session: m.session, index: m.index, state: jsonState(m.state), scroll: [m.scroll[0], m.scroll[1]] };
  } catch {
    return null;
  }
}
class BrowserHistory {
  constructor(win, automaticScroll) {
    this.win = win;
    this.automaticScroll = automaticScroll;
    const w = win;
    if (w[OWNER] !== void 0) input("already-owned", "This Window already has a running router");
    Object.defineProperty(w, OWNER, { configurable: true, value: this.token });
    this.seed = win.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.current = readEntry(win.history.state, win.location.href);
    this.originalScroll = win.history.scrollRestoration;
    if (automaticScroll) win.history.scrollRestoration = "manual";
  }
  win;
  automaticScroll;
  current;
  token = {};
  scrolls = /* @__PURE__ */ new Map();
  sequence = 0;
  seed;
  originalScroll;
  correction = null;
  key() {
    return `${this.seed}:${++this.sequence}`;
  }
  captureScroll() {
    if (this.automaticScroll && this.current?.href === this.win.location.href)
      this.scrolls.set(this.current.key, [this.win.scrollX, this.win.scrollY]);
  }
  write(href, state, replace) {
    this.captureScroll();
    const raw = this.win.history.state;
    const currentPhysical = readEntry(raw, this.win.location.href);
    const canAdopt = raw == null || record(raw) && (!Object.hasOwn(raw, HISTORY_KEY) || currentPhysical !== null);
    let next = null, value = raw;
    if (canAdopt) {
      const previous = currentPhysical;
      next = {
        library: "defuss-dom-router",
        version: 1,
        session: previous?.session ?? this.key(),
        index: replace ? previous?.index ?? 0 : previous ? previous.index + 1 : 0,
        key: replace && previous ? previous.key : this.key(),
        href,
        state,
        scroll: replace && previous ? this.scrolls.get(previous.key) ?? previous.scroll : [0, 0]
      };
      if (!replace && currentPhysical && this.automaticScroll) {
        const saved = this.scrolls.get(currentPhysical.key);
        if (saved) this.win.history.replaceState({ ...raw, [HISTORY_KEY]: { ...currentPhysical, scroll: saved } }, "", this.win.location.href);
      }
      value = { ...record(raw) ? raw : {}, [HISTORY_KEY]: next };
    }
    this.win.history[replace ? "replaceState" : "pushState"](value, "", href);
    this.current = next;
  }
  accept(entry) {
    this.current = entry;
  }
  /** Returns true only for the corrective event we were actually waiting for. */
  corrected(href, entry) {
    const c = this.correction;
    if (!c || entry?.key !== c.key || href !== c.href) return false;
    clearTimeout(c.timer);
    this.correction = null;
    c.done(true);
    return true;
  }
  async restore(from, to) {
    if (!from || !to || from.session !== to.session || from.index === to.index) return false;
    if (this.correction) {
      clearTimeout(this.correction.timer);
      this.correction.done(false);
      this.correction = null;
    }
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.correction = null;
        done(false);
      }, 3e3);
      this.correction = { key: from.key, href: from.href, done, timer };
      try {
        this.win.history.go(from.index - to.index);
      } catch {
        clearTimeout(timer);
        this.correction = null;
        done(false);
      }
    });
  }
  release() {
    if (this.correction) {
      clearTimeout(this.correction.timer);
      this.correction.done(false);
      this.correction = null;
    }
    const w = this.win;
    if (w[OWNER] === this.token) {
      if (this.automaticScroll) this.win.history.scrollRestoration = this.originalScroll;
      delete w[OWNER];
    }
  }
}

function bindLinks(root, resolve, navigate, options = {}) {
  const selector = options.selector ?? "a[data-router-link]";
  root.querySelector(selector);
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const click = (raw) => {
    const e = raw;
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const path = e.composedPath();
    const elements = path.filter((n) => n.nodeType === 1);
    const link = elements.find((el) => el.localName === "a" && el.hasAttribute("href"));
    if (!link || !link.matches(selector) || link.hasAttribute("download") || elements.some((el) => el.hasAttribute("data-router-ignore")) || link.getAttribute("rel")?.split(/\s+/).includes("external")) return;
    const target = link.getAttribute("target") || doc.querySelector("base[target]")?.getAttribute("target") || "_self";
    if (target.toLowerCase() !== "_self") return;
    let href;
    try {
      const url = new URL(link.getAttribute("href"), doc.baseURI);
      if (!["http:", "https:"].includes(url.protocol)) return;
      href = url.href;
      if (!resolve(href).match) return;
    } catch {
      return;
    }
    e.preventDefault();
    navigate(href);
  };
  root.addEventListener("click", click);
  return () => root.removeEventListener("click", click);
}

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function compileRoutes(definitions) {
  if (!Array.isArray(definitions)) return input("invalid-route", "routes must be an array");
  const ids = /* @__PURE__ */ new Set(), patterns = /* @__PURE__ */ new Set();
  return definitions.map((definition) => {
    if (!definition || typeof definition.id !== "string" || !definition.id || typeof definition.path !== "string")
      return input("invalid-route", "Each route needs a nonempty id and path");
    const authoredPath = definition.path;
    if (authoredPath !== "*" && (!authoredPath.startsWith("/") || authoredPath.startsWith("//")) || /[?#\\\x00-\x20\x7f]/u.test(authoredPath)) input("invalid-route", "Invalid route pattern");
    if (authoredPath.split("/").some((s) => [".", ".."].includes(encoding(s)))) input("invalid-route", "Patterns cannot contain dot segments");
    const path = authoredPath === "*" ? "*" : new URL("http://router.invalid" + authoredPath).pathname;
    if (path !== "*" && (!path.startsWith("/") || path.startsWith("//")) || /[?#\\\x00-\x20\x7f]/u.test(path))
      return input("invalid-route", "Patterns are root-relative paths without query, hash or whitespace");
    encoding(path);
    const canonical = path === "/" ? path : path.replace(/\/$/, "");
    if (ids.has(definition.id) || patterns.has(canonical)) return input("invalid-route", "Duplicate route id or pattern");
    ids.add(definition.id);
    patterns.add(canonical);
    const parts = [], names = [];
    const rx = /:([A-Za-z0-9_]+)|\*/g;
    let at = 0, source = "", match;
    while (match = rx.exec(path)) {
      const literal = path.slice(at, match.index);
      if (literal.includes(":")) return input("invalid-route", "A colon must introduce a named parameter");
      if (literal) parts.push({ literal });
      source += escaped(literal);
      const wildcard = match[0] === "*", name = wildcard ? "wildcard" : match[1];
      if (names.includes(name)) return input("invalid-route", "Duplicate parameter name");
      if (wildcard && (match.index !== path.length - 1 || path !== "*" && path[match.index - 1] !== "/"))
        return input("invalid-route", "A wildcard must be the final whole segment");
      names.push(name);
      parts.push({ name, wildcard });
      source += wildcard ? "(.*)" : "([^/]+)";
      at = match.index + match[0].length;
    }
    const tail = path.slice(at);
    if (tail.includes(":")) return input("invalid-route", "A colon must introduce a named parameter");
    if (tail) parts.push({ literal: tail });
    source += escaped(tail);
    if (path !== "*") source = source.endsWith("/") ? source.slice(0, -1) + "/?" : source + "/?";
    return { definition: Object.freeze({ id: definition.id, path: authoredPath }), regexp: new RegExp(`^${source}$`), parts, names };
  });
}
function matchPath(routes, path) {
  const params = /* @__PURE__ */ Object.create(null);
  for (const route of routes) {
    const hit = route.regexp.exec(path);
    if (!hit) continue;
    route.names.forEach((name, index) => {
      params[name] = encoding(hit[index + 1]);
    });
    return { match: true, routeId: route.definition.id, matchedRoute: route.definition.path, params: Object.freeze(params) };
  }
  return { match: false, routeId: null, matchedRoute: null, params: Object.freeze(params) };
}
function buildPath(route, params = {}) {
  if (!params || typeof params !== "object" || Array.isArray(params)) input("invalid-route", "Route params must be an object");
  for (const k of Object.keys(params)) if (!route.names.includes(k)) input("invalid-route", "Unexpected named-route parameter");
  return route.parts.map((part) => {
    if ("literal" in part) return part.literal;
    if (!Object.hasOwn(params, part.name) || typeof params[part.name] !== "string")
      return input("invalid-route", "Missing or non-string named-route parameter");
    const value = params[part.name];
    if (!value && !part.wildcard) return input("invalid-route", "Named parameters must not be empty");
    const segments = part.wildcard ? value.split("/") : [value];
    if (segments.some((p) => p === "." || p === "..")) return input("invalid-route", "Dot segments cannot be represented as route data in browser URLs");
    try {
      return segments.map((p) => encodeURIComponent(p)).join("/");
    } catch {
      return input("invalid-encoding", "Invalid Unicode in a route parameter");
    }
  }).join("");
}

function webUrl(href, base) {
  if (typeof href !== "string" || /[\x00-\x20\x7f\\]/u.test(href)) input("invalid-url", "URL references must not contain whitespace, controls or backslashes");
  let url;
  try {
    url = new URL(href, base);
  } catch {
    return input("invalid-url", "A valid HTTP(S) URL or base is required");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    return input("invalid-url", "Only credential-free HTTP(S) URLs are routable");
  encoding(url.pathname);
  encoding(url.search);
  encoding(url.hash);
  return url;
}
function normalizedBase(base = "/") {
  if (typeof base !== "string" || !base.startsWith("/") || base.startsWith("//") || /[?#]/u.test(base))
    return input("invalid-route", "basePath must be an origin-rooted directory path");
  const url = webUrl(base, "http://router.invalid/");
  if (url.pathname !== base) input("invalid-route", "basePath must already be URL-normalized");
  return base.endsWith("/") ? base : base + "/";
}
function withinBase(path, base) {
  return base === "/" || path === base.slice(0, -1) || path.startsWith(base);
}
class UrlSpace {
  constructor(routes, mode, basePath, getBase) {
    this.routes = routes;
    this.mode = mode;
    this.basePath = basePath;
    this.getBase = getBase;
  }
  routes;
  mode;
  basePath;
  getBase;
  resolve(href, baseHref) {
    const home = webUrl(this.getBase()), url = webUrl(href, baseHref ?? home.href);
    if (url.origin !== home.origin) input("outside-origin", "Destination is outside the application origin");
    if (!withinBase(url.pathname, this.basePath)) input("outside-base", "Destination is outside basePath");
    let logical;
    if (this.mode === "hash") {
      if (url.pathname !== home.pathname || url.search !== home.search)
        input("outside-shell", "Hash routing cannot change the physical shell path or outer query");
      const fragment = url.hash.slice(1) || "/";
      if (!fragment.startsWith("/") || fragment.startsWith("//")) input("outside-shell", "Hash routes must begin with #/");
      logical = webUrl(fragment, home.origin + "/");
    } else {
      const path = this.basePath === "/" ? url.pathname : url.pathname.slice(this.basePath.length - 1) || "/";
      logical = webUrl(url.origin + path + url.search + url.hash);
    }
    return Object.freeze({
      ...matchPath(this.routes, logical.pathname),
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      path: logical.pathname,
      search: logical.search,
      hash: logical.hash,
      query: Object.freeze(Array.from(logical.searchParams, (pair) => Object.freeze(pair)))
    });
  }
  href(target) {
    if (!target || typeof target.id !== "string") input("invalid-route", "A named route id is required");
    const route = this.routes.find((r) => r.definition.id === target.id);
    if (!route) return input("invalid-route", "Unknown named route");
    let path = buildPath(route, target.params);
    if (!path.startsWith("/")) path = "/" + path;
    const query = new URLSearchParams();
    if (target.query !== void 0) {
      if (!Array.isArray(target.query)) input("invalid-url", "query must be an ordered list of string pairs");
      for (const pair of target.query) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string")
          input("invalid-url", "query must contain string pairs");
        query.append(pair[0], pair[1]);
      }
    }
    if (target.hash !== void 0 && typeof target.hash !== "string") input("invalid-url", "hash must be unencoded string data");
    let hash = "";
    try {
      if (target.hash) hash = "#" + encodeURIComponent(target.hash);
    } catch {
      input("invalid-encoding", "Invalid Unicode in anchor");
    }
    const search = query.size ? "?" + query.toString() : "";
    const home = webUrl(this.getBase());
    const href = this.mode === "hash" ? home.pathname + home.search + "#" + path + search + hash : (this.basePath === "/" ? path : this.basePath.slice(0, -1) + path) + search + hash;
    this.resolve(href);
    return href;
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function createRouter(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) input("invalid-route", "Router configuration is required");
  config = { ...config };
  const routes = compileRoutes(config.routes), mode = config.mode ?? "history";
  if (mode !== "history" && mode !== "hash") input("invalid-route", "Unknown routing mode");
  if (config.scroll !== void 0 && !["auto", "manual"].includes(config.scroll)) input("invalid-route", "Unknown scrolling policy");
  const basePath = normalizedBase(config.basePath);
  let callbacks = {};
  let win, history, initialBase;
  let started = false, dead = false, sequence = 0, active = null, queued = null;
  let view = null, destroyPromise;
  const listeners = /* @__PURE__ */ new Set(), guards = /* @__PURE__ */ new Set(), disposers = /* @__PURE__ */ new Set();
  const initial = deferred();
  let initialSettled = false;
  let snapshot = Object.freeze({
    phase: "idle",
    current: null,
    pending: null,
    intentId: 0,
    entryKey: null,
    historyOwnership: "unowned",
    state: null,
    error: null
  });
  const environment = () => config.window ?? (typeof window === "undefined" ? void 0 : window);
  const base = () => snapshot.current?.href ?? initialBase ?? config.baseUrl ?? environment()?.location.href ?? input("invalid-url", "Provide baseUrl when resolving without a Window");
  const space = new UrlSpace(routes, mode, basePath, base);
  function report(error) {
    try {
      callbacks.onError?.(error, snapshot);
    } catch {
    }
  }
  function publish(update) {
    snapshot = Object.freeze({ ...snapshot, ...update });
    for (const listener of Array.from(listeners)) {
      try {
        listener(snapshot);
      } catch {
        report(diagnostic(null, "effect-error"));
      }
    }
  }
  function finishInitial(result) {
    if (!initialSettled) {
      initialSettled = true;
      initial.resolve(result);
    }
  }
  function settle(op, result) {
    if (!op.done) {
      op.done = true;
      op.resolve(Object.freeze(result));
    }
  }
  const current = (op) => active === op && !op.controller.signal.aborted && !dead;
  async function dispose(v) {
    if (!v?.dispose) return;
    try {
      await v.dispose();
    } catch {
      report(diagnostic(null, "effect-error"));
    }
  }
  function advance(op) {
    if (active !== op) return;
    active = null;
    if (queued && !dead) {
      const next = queued;
      queued = null;
      active = next;
      void execute(next);
    }
  }
  async function effects(ctx, op, after) {
    if (dead) return;
    await after?.(ctx);
    if (dead || config.scroll === "manual" || !win || ctx.cause === "render") return;
    if (op.traversal?.entry) {
      const p = history?.scrolls.get(op.traversal.entry.key) ?? op.traversal.entry.scroll;
      win.scrollTo(p[0], p[1]);
    } else if (ctx.to.hash) {
      const el = win.document.getElementById(encoding(ctx.to.hash.slice(1)));
      el?.scrollIntoView();
    } else if (ctx.from && ctx.from.path !== ctx.to.path) win.scrollTo(0, 0);
  }
  async function rejectTraversal(op) {
    if (!op.traversal) return true;
    op.locked = true;
    const restored = await history.restore(history.current, op.traversal.entry);
    if (!restored && !dead) {
      history.accept(null);
      publish({ historyOwnership: "unowned", entryKey: null });
    }
    return restored;
  }
  async function execute(op) {
    let prepared = null, assigned = false;
    const from = snapshot.current;
    const ctx = Object.freeze({ to: op.to, from, cause: op.cause, intentId: op.id, signal: op.controller.signal, state: op.state });
    const cb = { ...callbacks };
    let stage = "guard-error";
    try {
      if (!current(op)) return;
      if (from?.href === op.to.href && sameState(snapshot.state, op.state) && !op.traversal && !["initial", "render"].includes(op.cause) && snapshot.phase !== "error") {
        publish({ phase: "idle", pending: null, intentId: op.id, error: null });
        settle(op, { status: "unchanged", intentId: op.id, request: from });
        return;
      }
      publish({ phase: "preparing", pending: op.to, intentId: op.id, error: null });
      if (!current(op)) return;
      if (op.cause !== "render") {
        const chain = Array.from(guards);
        if (view?.beforeLeave && from && (from.routeId !== op.to.routeId || from.path !== op.to.path)) chain.unshift(view.beforeLeave);
        for (const guard of chain) {
          const allowed = await guard(ctx);
          if (!current(op)) return;
          if (allowed === false) {
            const restored = await rejectTraversal(op);
            if (dead) return;
            if (!restored) throw new RouterInputError("unowned-history", "Blocked traversal could not be restored; the browser URL changed, but protected content was not committed");
            publish({ phase: "idle", pending: null, error: null });
            settle(op, { status: "blocked", intentId: op.id, request: op.to, veto: op.traversal ? "owned-history-restored" : "before-write" });
            return;
          }
        }
      }
      if (!current(op)) return;
      const anchorOnly = op.cause !== "render" && from && from.path === op.to.path && from.search === op.to.search && sameState(snapshot.state, op.state);
      stage = "prepare-error";
      if (!anchorOnly) {
        prepared = cb.prepare ? await cb.prepare(ctx) : { commit() {
        } };
        if (!prepared || typeof prepared.commit !== "function") input("prepare-error", "prepare() must return a view with commit()");
      }
      if (!current(op)) return;
      op.locked = true;
      stage = "history-error";
      if (op.traversal) history.accept(op.traversal.entry);
      else if (op.cause !== "render") history.write(op.to.href, op.state, op.replace);
      op.commitStarted = true;
      publish({
        phase: "committing",
        current: op.to,
        pending: null,
        state: op.state,
        entryKey: history.current?.key ?? null,
        historyOwnership: history.current ? "owned" : "unowned"
      });
      if (prepared) {
        stage = "commit-error";
        const previous = view;
        view = null;
        try {
          await prepared.commit();
          view = prepared;
          assigned = true;
        } finally {
          await dispose(previous);
        }
      }
      stage = "effect-error";
      await effects(ctx, op, cb.afterCommit);
      if (dead) settle(op, { status: "rejected", intentId: op.id, error: diagnostic(new RouterInputError("destroyed", "Router was destroyed"), "destroyed") });
      else {
        publish({ phase: "idle", pending: null, error: null });
        settle(op, { status: "committed", intentId: op.id, request: op.to });
      }
    } catch (error) {
      if (current(op) || op.locked && !dead) {
        let failure = diagnostic(error, stage);
        if (op.traversal && !op.commitStarted && failure.code !== "unowned-history") {
          if (!await rejectTraversal(op)) failure = diagnostic(new RouterInputError("unowned-history", "Traversal failed and cannot be restored; application recovery is required"), "unowned-history");
        }
        if (!dead) {
          publish({ phase: "error", pending: null, error: failure });
          report(failure);
        }
        settle(op, { status: "error", intentId: op.id, error: failure, commitStarted: op.commitStarted });
      }
    } finally {
      if (prepared && !assigned) await dispose(prepared);
      if (!op.done) settle(op, { status: "superseded", intentId: op.id });
      advance(op);
    }
  }
  function rejected(code, message) {
    const error = diagnostic(new RouterInputError(code, message), code);
    const result = Object.freeze({ status: "rejected", intentId: ++sequence, error });
    report(error);
    return Promise.resolve(result);
  }
  function submit(href, options, cause, traversal) {
    if (dead) return rejected("destroyed", "Router was destroyed");
    if (!started) return rejected("not-started", "Call start() before navigating");
    let to, state;
    try {
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["replace", "state", "cause"].includes(k)) || options.replace !== void 0 && typeof options.replace !== "boolean" || options.cause !== void 0 && !["programmatic", "native"].includes(options.cause))
        input("invalid-route", "Invalid navigation options");
      to = space.resolve(href);
      state = Object.hasOwn(options, "state") ? jsonState(options.state) : traversal ? traversal.entry?.state ?? null : snapshot.current?.href === to.href ? snapshot.state : cause === "initial" ? history.current?.state ?? null : null;
    } catch (error) {
      const failure = diagnostic(error, "invalid-url");
      report(failure);
      return Promise.resolve({ status: "rejected", intentId: ++sequence, error: failure });
    }
    const result = deferred();
    const op = {
      id: ++sequence,
      to,
      state,
      cause,
      replace: options.replace ?? false,
      traversal,
      controller: new AbortController(),
      locked: false,
      commitStarted: false,
      done: false,
      ...result
    };
    if (active?.locked) {
      if (queued) {
        queued.controller.abort();
        settle(queued, { status: "superseded", intentId: queued.id });
      }
      queued = op;
    } else {
      if (active) {
        active.controller.abort();
        settle(active, { status: "superseded", intentId: active.id });
      }
      active = op;
      void execute(op);
    }
    return result.promise;
  }
  function changed(event) {
    if (dead || !history || !win) return;
    const href = win.location.href, entry = readEntry(win.history.state, href);
    if (history.corrected(href, entry)) return;
    if (snapshot.current?.href === href && snapshot.entryKey === (entry?.key ?? null) && sameState(snapshot.state, entry?.state ?? null)) return;
    if (active?.traversal && active.to.href === href && active.traversal.entry?.key === entry?.key) return;
    void submit(href, {}, event.type === "popstate" ? "traverse" : "hashchange", { entry }).then((result) => {
      if (result.status === "rejected" && !dead && win?.location.href === href) {
        history?.accept(null);
        publish({ phase: "error", pending: null, entryKey: null, historyOwnership: "unowned", error: result.error });
      }
    });
  }
  const api = {
    start(initialHref) {
      if (started || initialSettled) return initial.promise;
      if (dead) {
        const r = rejected("destroyed", "Router was destroyed");
        void r.then(finishInitial);
        return r;
      }
      try {
        win = environment();
        if (!win) input("not-started", "A real Window is required to start browser routing");
        initialBase = config.baseUrl ?? win.location.href;
        const to = space.resolve(initialHref ?? win.location.href);
        if (to.origin !== win.location.origin) input("outside-origin", "Configured base is not the Window origin");
        history = new BrowserHistory(win, config.scroll !== "manual");
        started = true;
        for (const name of ["popstate", "hashchange"]) {
          win.addEventListener(name, changed);
          disposers.add(() => win.removeEventListener(name, changed));
        }
        const scroll = () => history.captureScroll();
        win.addEventListener("scroll", scroll, { passive: true });
        disposers.add(() => win.removeEventListener("scroll", scroll));
        void submit(to.href, { replace: true }, "initial").then(finishInitial);
      } catch (error) {
        history?.release();
        const failure = diagnostic(error, "not-started");
        report(failure);
        finishInitial({ status: "rejected", intentId: ++sequence, error: failure });
      }
      return initial.promise;
    },
    ready: () => initial.promise,
    resolve: (href, baseHref) => space.resolve(href, baseHref),
    href: (target) => space.href(target),
    navigate: (href, options = {}) => submit(href, options, options?.cause ?? "programmatic"),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (dead) input("destroyed", "Router was destroyed");
      if (typeof listener !== "function") input("invalid-route", "subscribe requires a function");
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beforeEach(guard) {
      if (dead) input("destroyed", "Router was destroyed");
      if (typeof guard !== "function") input("invalid-route", "beforeEach requires a function");
      guards.add(guard);
      return () => {
        guards.delete(guard);
      };
    },
    attachLinks(root, options) {
      if (dead) input("destroyed", "Router was destroyed");
      const eligible = (href) => started ? space.resolve(href) : input("not-started", "Links are native until start()");
      const detach = bindLinks(root, eligible, (href) => {
        void submit(href, {}, "link");
      }, options);
      const dispose2 = () => {
        detach();
        disposers.delete(dispose2);
      };
      disposers.add(dispose2);
      return dispose2;
    },
    config(next) {
      if (dead) input("destroyed", "Router was destroyed");
      if (!next || typeof next !== "object" || Array.isArray(next)) input("invalid-route", "Callbacks must be an object");
      for (const [key, value] of Object.entries(next)) if (!["prepare", "afterCommit", "onError"].includes(key) || value !== void 0 && typeof value !== "function")
        input("invalid-route", "config() accepts callback functions only");
      callbacks = { ...callbacks, ...next };
    },
    render() {
      if (dead) return rejected("destroyed", "Router was destroyed");
      if (!snapshot.current) return rejected("not-started", "The initial view has not committed");
      return submit(snapshot.current.href, { state: snapshot.state }, "render");
    },
    destroy() {
      if (destroyPromise) return destroyPromise;
      dead = true;
      for (const detach of Array.from(disposers)) detach();
      disposers.clear();
      history?.release();
      guards.clear();
      if (queued) {
        queued.controller.abort();
        settle(queued, { status: "rejected", intentId: queued.id, error: { code: "destroyed", message: "Router was destroyed" } });
        queued = null;
      }
      const running = active;
      if (running && !running.locked) {
        running.controller.abort();
        settle(running, { status: "superseded", intentId: running.id });
      }
      finishInitial({ status: "rejected", intentId: sequence, error: { code: "destroyed", message: "Router was destroyed" } });
      publish({ phase: "destroyed", pending: null });
      listeners.clear();
      destroyPromise = (async () => {
        if (running?.locked) await running.promise;
        const previous = view;
        view = null;
        await dispose(previous);
      })();
      return destroyPromise;
    }
  };
  api.config({ prepare: config.prepare, afterCommit: config.afterCommit, onError: config.onError });
  return api;
}

export { RouterInputError, createRouter };
