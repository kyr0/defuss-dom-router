# defuss-dom-router

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A dependency-free client router for web pages that render with plain DOM, defuss-query, defuss-morph or any other renderer you inject.

## TL;DR

Single-page apps need URLs that survive reloads, Back/Forward and leave confirmations, but most routers also bring a renderer, a store or a framework. This router only turns URLs into immutable route requests and orders navigations against the real History API; your `prepare`/`commit` callbacks do the rendering. You get awaitable navigation results instead of guessing whether a view actually changed.

- Named routes with `:params`, one trailing `*` wildcard and portable `href()` generation in history or hash mode, under an optional `basePath`.
- Every `navigate()` resolves to `committed`, `unchanged`, `blocked`, `superseded`, `rejected` or `error`.
- Async guards run before history is written; a blocked Back/Forward is corrected with `history.go()` without truncating the forward stack.
- A newer navigation abandons an older one that is still preparing; commits never interleave.
- Opt-in delegated `<a data-router-link>` handling that leaves modified clicks, downloads, other targets and external links to the browser.
- No runtime dependencies; one self-contained ESM file of 32,562 bytes (8,928 gzip).

## Quick start

Requirements: Bun 1.4.2 (pinned in `packageManager`), Node.js and Python 3 for the static server. Verified with Node.js 24.14.0 and Python 3.14.3; CI pins Node.js 22.16.0.

```bash
bun install --frozen-lockfile && make build
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/examples/plain/index.html#/projects/42?tab=timeline#event-7`. The page title reads `Project 42 · Defuss routing`. The project links and the Back, Forward, replace and rerender buttons navigate without reloading the document, and the routing-state panel shows the live router snapshot.

The website in `docs/` explains the router with a live demo app, an explorer for `resolve()` and `href()` and the API reference. GitHub Pages publishes it from `docs/` on `main` at https://dom-router.defuss.org. It is static, so the server above also serves it at `http://127.0.0.1:8080/docs/`. It loads defuss-shadcn from jsDelivr and serves its own copy of `dist/index.js`.

## Usage

The package is not published to npm yet. Install it from a local checkout with `bun add /path/to/defuss-dom-router`, or copy `dist/index.js` into your static assets: it imports nothing, so it runs as a plain browser module.

**Render routes in the browser.** `prepare()` builds the view without touching the page; `commit()` puts it on screen.

```js
import { createRouter } from './assets/defuss-dom-router.js';

const outlet = document.querySelector('main');
if (!outlet) throw new Error('A main outlet is required');
const router = createRouter({
  routes: [{ id: 'project', path: '/projects/:id' }, { id: 'missing', path: '*' }],
  prepare({ to }) {
    const heading = document.createElement('h1');
    heading.textContent = to.match && to.routeId === 'project'
      ? `Project ${to.params.id}` : 'Not found';
    return { commit() { outlet.replaceChildren(heading); } };
  },
});
router.attachLinks(document);
await router.start();
```

Served at `/projects/42`, the outlet shows `Project 42`. A click on `<a data-router-link href="/projects/7">` shows `Project 7` and Back shows `Project 42` again, all in one document load. Direct loads of clean paths like `/projects/42` need your server to answer them with the same HTML document; with `mode: 'hash'` an ordinary static server is enough.

**Resolve and build URLs without a Window**, for example on a server or in tests:

```js
import { createRouter } from 'defuss-dom-router';

const router = createRouter({
  baseUrl: 'https://example.test/app/',
  basePath: '/app',
  routes: [{ id: 'project', path: '/projects/:id' }, { id: 'missing', path: '*' }],
});
const to = router.resolve('/app/projects/42?tab=timeline&tab=files#event-7');
console.log(to.routeId, to.params, to.query, to.hash);
console.log(router.href({ id: 'project', params: { id: 'a b' }, query: [['tab', 'files']] }));
```

```text
project [Object: null prototype] { id: '42' } [ [ 'tab', 'timeline' ], [ 'tab', 'files' ] ] #event-7
/app/projects/a%20b?tab=files
```

**Render with defuss-query or defuss-morph.** The router imports neither; call them inside `commit()`. Their `html()`/`morph()` take markup or VNodes, not a DOM element, so serialize what you built:

```js
prepare({ to }) {
  const heading = document.createElement('h1');
  heading.textContent = to.routeId === 'record' ? `Record ${to.params.id}` : 'Not found';
  const markup = heading.outerHTML;
  return { async commit() { await df$('#route-view').html(markup); } };
}
```

With shadcn's core already loaded, reuse its `globalThis.df$` instead of loading a second query/morph engine. `examples/peers/` contains both variants; `make examples` downloads their pinned assets.

### API

`createRouter({ routes, mode?, basePath?, baseUrl?, window?, scroll?, prepare?, afterCommit?, onError? })`. The full types are in [src/types.ts](src/types.ts).

| Method | Semantics |
| --- | --- |
| `start(initialHref?)`, `ready()` | Await the initial navigation result. An explicit initial location replaces the current entry. Idempotent; importing never starts a router. |
| `resolve(href, baseHref?)` | Pure, immutable route request; typed errors for invalid, out-of-origin or out-of-base input. |
| `href({ id, params?, query?, hash? })` | Named href generation. Query is ordered string pairs, so duplicate keys survive. Hash is unencoded anchor text. |
| `navigate(href, { replace?, state?, cause? })` | Promise of the navigation result. `cause` is `programmatic` or `native`. |
| `getSnapshot()`, `subscribe(fn)` | Immutable navigation state; subscribing returns a disposer and does not call back immediately. |
| `beforeEach(guard)` | Disposable async global guard. Only an exact `false` blocks; exceptions become explicit errors. |
| `attachLinks(root, { selector? })` | Delegated links, default `a[data-router-link]`; returns a disposer. Links stay native until `start()`. |
| `config(callbacks)` | Replace callbacks only, not mode, routes or base. |
| `render()` | Re-render the current screen without guards or history writes. |
| `destroy()` | Remove listeners immediately, settle pending navigations, await a running commit and dispose its view. |

**Routes.** Patterns are full matches with `:named` segments, embedded parameters such as `/api/v:version`, one terminal `/*` wildcard (its value is named `wildcard`) and an optional trailing slash. The first registered match wins. Duplicate IDs, patterns or parameter names and dot segments fail at construction.

**Requests.** A `RouteRequest` has `match`, `routeId`, `matchedRoute`, the physical `href`/`origin`/`pathname`, the logical `path`/`search`/`hash`, once-decoded `params` and the frozen, ordered `query`. In hash mode the page path stays fixed and `#/path?query#anchor` is the route. Only HTTP(S) URLs without credentials are accepted. Use `href()` for links under a base directory.

**State.** Navigation state must be finite JSON; the router copies and freezes it. Other fields you keep in `history.state` survive. Do not call `history.pushState`/`replaceState` yourself while a router owns the Window: such entries carry no router metadata, so a blocked Back onto them cannot be corrected.

**Views.** `prepare(context)` returns `{ commit(), dispose?(), beforeLeave?() }`. It may fetch with `context.signal` and build detached DOM, but must not change the live page. A superseded view is disposed without committing. Once `commit()` starts it is never interrupted or rolled back, and a failed commit is reported as an error. `beforeLeave` runs when the route ID or path changes; query-only changes re-prepare without stacking leave hooks, and hash-only changes skip rendering. Callbacks must not await navigation or `destroy()` of their own router while it commits, because that would wait on itself.

**Scroll and focus.** With the default `scroll: 'auto'`, the router scrolls to anchors after commit and restores the saved position on Back/Forward; `scroll: 'manual'` turns that off. Title, focus and ARIA updates belong in `afterCommit`.

## How it works

URL parsing and matching are pure functions; one coordinator orders navigations, runs guards and your `prepare` step, writes or adopts the history entry and only then calls `commit()`. Each history entry the router writes carries a session ID and index, which is how a blocked Back/Forward finds its way back. [ARCH.md](ARCH.md) explains the design and its limits.

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

## Configuration

The router reads no environment variables. The test tooling reads these optional ones from `.env.example`:

| Variable | Meaning | Default |
| --- | --- | --- |
| `ROUTER_BROWSERS` | Comma-separated Playwright engines for `make e2e` | `chromium` |
| `CHROMIUM_PATH` | Chromium executable to use instead of Playwright's pinned build | Playwright's build |
| `PLAYWRIGHT_MODULE` | Path to a Playwright package when it is not installed in `node_modules` | unset |

## License

MIT, see [LICENSE](LICENSE).
