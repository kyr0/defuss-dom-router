# defuss-dom-router

The [defuss](https://github.com/kyr0/defuss) client router as a standalone, dependency-free package.

defuss-dom-router turns URLs into immutable route requests and orders navigations against the browser's real History API. Your `prepare()` and `commit()` callbacks do the rendering, with plain DOM, defuss-query, defuss-morph or any other renderer. Every `navigate()` resolves to exactly one outcome, so you never have to guess whether the screen changed. Website with a live demo: [dom-router.defuss.org](https://dom-router.defuss.org).

## TL;DR

Single-page apps need URLs that survive reloads, Back/Forward and leave confirmations, but most routers also bring a renderer, a store or a framework. This router only resolves URLs and orders navigations; it never touches your page itself. One `<script type="module">` is enough to use it.

Features:
- 🧭 Named routes with `:params`, embedded parameters (`/api/v:version`) and one trailing `*` wildcard
- 🔗 Portable `href()` generation in history or hash mode, under an optional `basePath`
- ✅ Awaitable outcomes: `await router.navigate()` resolves to `committed`, `unchanged`, `blocked`, `superseded`, `rejected` or `error`; failures settle as values, never as unhandled rejections
- 🛡️ Guards before history: async guards and `beforeLeave` run before `pushState`, so a veto leaves history untouched; a vetoed Back or Forward is walked back with `history.go()`, and the forward stack survives
- ⏩ The latest navigation wins: a newer navigation abandons one that is still preparing and disposes its view before anything changes on screen; commits are serialized and never interleave
- 🎨 Bring your own renderer: `prepare()` builds the next view detached from the page, `commit()` puts it on screen; native DOM, defuss-query, defuss-morph or shadcn's `df$`, the router imports none of them
- 🖱️ Opt-in delegated `<a data-router-link>` handling that leaves modified clicks, downloads, other targets and external links to the browser
- 🔒 Strict by default: only credential-free HTTP(S) URLs on your origin and inside `basePath` are routed, navigation state must be finite JSON, and diagnostics carry a code and fixed text, never the URL
- 🪶 One file, zero dependencies: one self-contained ESM file of 32.6 kB (8.9 kB gzip) that imports nothing; importing it starts nothing and attaches no listener
- 💯 Pure `resolve()`/`href()` also work without a Window, on a server or in tests
- 🧪 ~97% line coverage of the shipped bundle, with real browser E2E tests in Chromium, Firefox and WebKit
- 🟦 Written in TypeScript, ships ESM, CommonJS and declarations

## Quick, zero-build setup

The package is not published to npm yet. Build it once from a checkout, then copy the one built file into your project assets:

```bash
git clone https://github.com/kyr0/defuss-dom-router.git
cd defuss-dom-router
bun install --frozen-lockfile && make build
```

Example:
```text
project/
├── assets/
│   └── js/
│       └── defuss-dom-router.js   # a copy of dist/index.js
└── index.html
```

`dist/index.js` imports nothing, so it runs as a plain browser module:

```html
<body>
  <main>Loading…</main>
  <a data-router-link href="/projects/7">Project 7</a>

  <script type="module">
    import { createRouter } from "./assets/js/defuss-dom-router.js";

    const outlet = document.querySelector("main");
    const router = createRouter({
      routes: [{ id: "project", path: "/projects/:id" }, { id: "missing", path: "*" }],
      prepare({ to }) {
        const heading = document.createElement("h1");
        heading.textContent = to.routeId === "project" ? `Project ${to.params.id}` : "Not found";
        return { commit() { outlet.replaceChildren(heading); } };
      },
    });
    router.attachLinks(document);
    await router.start();
  </script>
</body>
```

Served at `/projects/42`, the outlet shows `Project 42`. A click on the link shows `Project 7` and Back shows `Project 42` again, all in one document load. Clean paths like `/projects/42` need your server to answer them with the same HTML; with `mode: "hash"` any static server is enough.

- **Good for:** Offline support, air-gapped environments, quick prototyping and locking the exact version you ship.
- **Drawbacks:** Manual updates, and no bundler optimizations.

## For production: Install via package manager

Install from a local checkout (see above) until the package is published. This gives you version pinning and tree-shaking through your bundler:

```bash
bun add /path/to/defuss-dom-router
```

Then, in `.ts` or `.js` files:

```ts
import { createRouter } from "defuss-dom-router";

const router = createRouter({
  routes: [{ id: "project", path: "/projects/:id" }, { id: "missing", path: "*" }],
  prepare({ to, signal }) {
    // fetch with the signal: a newer navigation aborts this one before anything is shown
    return { commit() { /* put the view on screen */ } };
  },
});
router.attachLinks(document);

const result = await router.navigate(router.href({ id: "project", params: { id: "42" } }));
// result.status is "committed" | "unchanged" | "blocked" | "superseded" | "rejected" | "error"
```

Requirements for building: Bun 1.4.2 (pinned in `packageManager`) and Node.js. Verified with Node.js 24.14.0; CI pins Node.js 22.16.0.

## Rendering with defuss-query or defuss-morph

The router imports neither; call them inside `commit()`. Their `html()`/`morph()` take markup or VNodes, not a DOM element, so serialize what you built:

```js
prepare({ to }) {
  const heading = document.createElement("h1");
  heading.textContent = to.routeId === "record" ? `Record ${to.params.id}` : "Not found";
  const markup = heading.outerHTML;
  return { async commit() { await df$("#route-view").html(markup); } };
}
```

With defuss-shadcn's core already loaded, reuse its `globalThis.df$` instead of loading a second query/morph engine. [`examples/peers/`](examples/peers/) contains both variants; `make examples` downloads their pinned assets.

## API

`createRouter({ routes, mode?, basePath?, baseUrl?, window?, scroll?, prepare?, afterCommit?, onError? })` validates the configuration synchronously and copies it. Afterwards only the callbacks can change, through `config()`; new routes or a new mode need a new router. The full declarations are in [src/types.ts](src/types.ts) and ship as `dist/index.d.ts`.

### `start(initialHref?)` and `ready()`

Await the initial navigation result. An explicit initial location replaces the current entry instead of pushing. Idempotent; importing or constructing never starts a router or attaches a listener. One router owns one Window; a second fails with `already-owned` until the first is destroyed.

### `resolve(href, baseHref?)`

A pure, immutable `RouteRequest` with `match`, `routeId`, `matchedRoute`, the physical `href`/`origin`/`pathname`, the logical `path`/`search`/`hash`, once-decoded `params` and the frozen, ordered `query` (duplicate keys survive). Throws a typed `RouterInputError` for invalid, out-of-origin or out-of-base input. Works without a Window from `baseUrl` alone:

```js
const router = createRouter({
  baseUrl: "https://example.test/app/",
  basePath: "/app",
  routes: [{ id: "project", path: "/projects/:id" }, { id: "missing", path: "*" }],
});
const to = router.resolve("/app/projects/42?tab=timeline&tab=files#event-7");
console.log(to.routeId, to.params, to.query, to.hash);
console.log(router.href({ id: "project", params: { id: "a b" }, query: [["tab", "files"]] }));
```

```text
project [Object: null prototype] { id: '42' } [ [ 'tab', 'timeline' ], [ 'tab', 'files' ] ] #event-7
/app/projects/a%20b?tab=files
```

### `href({ id, params?, query?, hash? })`

Named href generation, portable across history and hash mode and `basePath`. Query is ordered string pairs; hash is unencoded anchor text. Validates every required parameter. Use it for links under a base directory.

### `navigate(href, { replace?, state?, cause? })`

A promise of the navigation result; it never rejects. `cause` is `programmatic` (default) or `native`, for links a native shell delivers. State must be finite JSON; the router copies and freezes it, and other fields you keep in `history.state` survive.

| Outcome | Meaning | Shape |
| --- | --- | --- |
| `committed` | History was written or adopted, and the prepared view, if any, committed. | `{ status, intentId, request }` |
| `unchanged` | Same href and state as the current entry, and no failed navigation to recover from. Nothing ran. | `{ status, intentId, request }` |
| `blocked` | A global guard or `beforeLeave` returned exactly `false`. `veto` says whether history was untouched or restored. | `{ …, veto: 'before-write' \| 'owned-history-restored' }` |
| `superseded` | A newer navigation took over before this one locked. A view it had prepared was disposed, never shown. | `{ status, intentId }` |
| `rejected` | Invalid input, or a router that is not started or was destroyed. Invalid input runs nothing and writes nothing. | `{ status, intentId, error }` |
| `error` | A guard, `prepare()`, the history write, `commit()` or an effect failed. | `{ …, error, commitStarted }` |

### `getSnapshot()` and `subscribe(listener)`

The frozen navigation state: `phase` (`idle`, `preparing`, `committing`, `error`, `destroyed`), `current`, `pending`, `intentId`, `entryKey`, `historyOwnership`, `state` and `error`. Subscribing returns a disposer and does not call back immediately.

### `beforeEach(guard)`

A disposable async global guard. Only an exact `false` blocks; an exception becomes a `guard-error`. Guards run before `pushState`, so a veto leaves history untouched; a vetoed Back/Forward is walked back with `history.go()`.

### `attachLinks(root, { selector? })`

One delegated click listener, default `a[data-router-link]`; returns a disposer. Modified clicks, downloads, other targets, `rel="external"`, `data-router-ignore` and non-HTTP(S) schemes stay native. Links stay native until `start()`.

### `config(callbacks)`, `render()` and `destroy()`

`config()` replaces `prepare`, `afterCommit` or `onError` only. `render()` prepares and commits the current screen again, without guards or history writes. `destroy()` removes listeners at once, settles pending navigations, awaits a running commit and disposes its view.

### Routes

Patterns are full matches with `:named` segments, embedded parameters such as `/api/v:version`, one terminal `/*` wildcard (its value is named `wildcard`) and an optional trailing slash. A lone `*` catches everything. The first registered match wins. Duplicate IDs, patterns or parameter names and dot segments fail at construction. Parameters are decoded once, so an encoded `%2F` stays data and never becomes route structure.

### Views

`prepare(context)` returns `{ commit(), dispose?(), beforeLeave?() }`. It may fetch with `context.signal` and build detached DOM, but must not change the live page. A superseded view is disposed without committing. Once `commit()` starts it is never interrupted or rolled back; a failed commit is reported as an error. `beforeLeave` runs when the route ID or path changes; query-only changes prepare a new view without stacking leave hooks, and anchor-only changes skip rendering. Callbacks must not await navigation or `destroy()` of their own router while it commits, because that would wait on itself.

### Scroll and focus

With the default `scroll: "auto"`, the router scrolls to anchors after commit and restores the saved position on Back/Forward; `scroll: "manual"` turns that off. Title, focus and ARIA updates belong in `afterCommit`.

### Errors

`resolve()` and `href()` throw `RouterInputError` with a `code`; `navigate()` resolves to `rejected` or `error` instead, and `onError` receives the same `{ code, message }`. Messages are fixed text and never contain the URL or the text of an exception your callback threw. Codes: `invalid-url`, `invalid-encoding`, `invalid-route`, `outside-origin`, `outside-base`, `outside-shell`, `invalid-state`, `not-started`, `already-owned`, `destroyed`, `guard-error`, `prepare-error`, `history-error`, `commit-error`, `effect-error` and `unowned-history`.

## How it works

URL parsing and matching are pure functions; one coordinator orders the intents, runs the guards and your `prepare()`, writes or adopts the history entry and only then calls `commit()`. Every entry the router writes carries a session ID and an index, which is how a vetoed Back or Forward finds its way back. [ARCH.md](ARCH.md) explains the design and its limits.

Intent ordering:
1. **One active, one queued.** At most one intent is active and at most one waits. Everything else has already settled.
2. **Newer aborts the unlocked.** While the active intent guards or prepares, a new one aborts its `AbortSignal`: superseded, view disposed.
3. **Locked work finishes.** Once history is written and `commit()` started, new intents queue. A later one replaces the queued one, so the latest wins.
4. **Checked after every await.** The coordinator re-checks that its intent is still current after each `await`, also when a subscriber navigates from inside a snapshot callback.

## Examples

Runnable zero-build pages. Serve the repository root statically after `make build`, for example with `python3 -m http.server 8080 --bind 127.0.0.1`:

| Example | What it shows |
| --- | --- |
| [`docs/`](docs/) | The website: a routed demo app with router devtools, a `resolve()`/`href()` explorer and the API reference; also live at [dom-router.defuss.org](https://dom-router.defuss.org) |
| [`examples/plain/index.html`](examples/plain/index.html) | Plain DOM rendering in hash mode: deep links, Back/Forward, replace, re-render, a leave confirmation and the live snapshot. Open `#/projects/42?tab=timeline#event-7` |
| [`examples/peers/index.html`](examples/peers/index.html) | Rendering through defuss-query and defuss-morph (`?renderer=morph` calls morph directly); needs `make examples` |
| [`examples/peers/shadcn.html`](examples/peers/shadcn.html) | Reusing defuss-shadcn's embedded `df$` instead of a second engine; needs `make examples` |

## One limitation with foreign history entries

The router can only correct a blocked Back/Forward within entries it wrote itself, because the correction needs the session ID and index it stores in each entry. Do not call `history.pushState`/`replaceState` yourself while a router owns the Window: such entries carry no router metadata, so a blocked Back onto them reports `unowned-history` and the protected content is not committed. A push after a foreign entry starts a new session, so a correction never crosses it.

## Size

<!-- bundle-size:start -->
| File | Size | Gzipped | Brotli | Purpose |
| --- | ---: | ---: | ---: | --- |
| `index.js` | 32,562 B | **8,928 B** | 7,863 B | ESM build; self-contained, for bundlers and direct `<script type="module">` use |
| `index.cjs` | 32,616 B | 8,952 B | 7,875 B | CommonJS build |
| `index.d.ts` | 7,785 B | | | TypeScript declarations (`index.d.cts` is the CommonJS twin) |
<!-- bundle-size:end -->

Sizes are `make metrics` output for the 0.1.0 build. `make lint` fails when `index.js` imports another module or grows past 14,000 bytes gzip.

## Vibe coding

Paste this prompt into your coding agent. It links the repository, so the agent works from this README and the bundled [SKILL.md](SKILL.md):

```text
Integrate defuss-dom-router into this app: https://github.com/kyr0/defuss-dom-router
Read its README.md and SKILL.md first. It is not on npm: build it from a checkout (bun install, make build) and import createRouter from the package or a copied dist/index.js.
Register routes and guards before start(). Build each screen in prepare() without touching the live page, put it on screen in commit(), and await every navigation result, including blocked, superseded and error.
Use real <a data-router-link> anchors with hrefs from router.href(). Use mode: 'hash' only when the server cannot answer deep links with the app's HTML.
```

Give your agent the [defuss-vae](https://github.com/kyr0/defuss-vae) skills too: it then plans, tests and reviews against a verifier instead of declaring itself done. In Claude Code, the plugin adds the commit and Stop-hook gate. Needs `python3` ≥ 3.9, `git` and `make`.

```bash
npx skills add kyr0/defuss-vae --skill '*'
# Claude Code plugin:
claude plugin marketplace add kyr0/defuss-vae
claude plugin install defuss-vae@defuss-vae
```

## Development

```bash
make setup && make verify
```

| Command | What it runs |
| --- | --- |
| `make build` | `pkgroll` → `dist/` (ESM, CJS, declarations), plus a test-only bundle of internal modules in `tmp/units/` |
| `make docs` | Build, then copy `dist/index.js` to `docs/assets/defuss-dom-router.js`; `make test` fails while that copy is stale |
| `make lint` | `tsc --noEmit`, `oxlint --deny-warnings`, `tools/policy.py` |
| `make test` | Node tests against the built package, an isolated consumer of the packed tarball, Python tests of the VAE adapter |
| `make coverage` | Line coverage of `dist/index.js`, Node and Chromium e2e merged; fails below 90 % (the VAE gate checks the same floor) |
| `make e2e` | The browser suite, then the website (`docs/`): landing page, explorer and every playground route, in every engine listed in `ROUTER_BROWSERS` (default `chromium`); the website check needs network access to jsDelivr |
| `make browser-primitives` | History and link units on Chromium's blank page |
| `make examples` | Build, then download the pinned query/morph/shadcn assets for `examples/peers/` |
| `make metrics` | Raw, gzip and Brotli sizes of `dist/` |
| `make agent-init && make gate` | Git hooks and the pinned defuss-vae verify, review and docs gate |

`make verify` runs lint, test, coverage and e2e; a browser that cannot launch fails it. Run `ROUTER_BROWSERS=chromium,firefox,webkit make e2e` for the full browser matrix. Start reading at [ARCH.md](ARCH.md) and [src/router.ts](src/router.ts).

The router reads no environment variables. The test tooling reads these optional ones from `.env.example`:

| Variable | Meaning | Default |
| --- | --- | --- |
| `ROUTER_BROWSERS` | Comma-separated Playwright engines for `make e2e` | `chromium` |
| `CHROMIUM_PATH` | Chromium executable to use instead of Playwright's pinned build | Playwright's build |
| `PLAYWRIGHT_MODULE` | Path to a Playwright package when it is not installed in `node_modules` | unset |

## Citation

If you use defuss-dom-router in research or want to reference it, cite it as:

```bibtex
@misc{homberg2026defussdomrouter,
  author       = {Homberg, Aron},
  affiliation  = {Independent Researcher},
  title        = {defuss-dom-router: a dependency-free client router with awaitable navigation},
  year         = {2026},
  version      = {0.1.0},
  howpublished = {\url{https://github.com/kyr0/defuss-dom-router}},
  note         = {Standalone package of the defuss client router, MIT License}
}
```

## License

[MIT](LICENSE)
