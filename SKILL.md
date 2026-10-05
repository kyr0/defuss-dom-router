---
name: defuss-dom-router
description: Use the standalone routing package with native DOM, defuss-query or defuss-morph.
disable-model-invocation: true
---

Read README.md and the package's dist/index.d.ts. Import createRouter from the package or a locally copied dist/index.js. Install no full defuss framework. Inject rendering; query/morph/shadcn are caller-owned and must not be duplicated.

Use real anchors with data-router-link. Named href() avoids base/hash errors. Keep duplicate query pairs and anchor data. Use hash mode only explicitly when an HTTP document fallback is unavailable.

Register routes/guards before start. Await navigation results, including error/blocked/superseded. Preparation uses AbortSignal and detached data; commit owns synchronous/awaited live mutation and must not enqueue unbounded late writes. Scope dispose removes only resources it owns. Keep persistent UI outside the route outlet. Re-rendering is render(), never a fake push to the same URL.

Use the existing query html(content, options) or morph(element, content, options) APIs. A native Element is not RenderInput; use safe app-created outerHTML or VNodes. A different record needs a distinct root key/ID to avoid preserving another record's uncontrolled fields.

A native shell delivers links by calling navigate(href, { cause: 'native' }) with an HTTP(S) URL on the app origin; never navigate the page to a custom scheme. Guard incoming links like any other navigation.

Run the actual browser tests and package consumers. Never substitute mocked history or blank-page unit results for full HTTP integration. Use the pinned upstream VAE and leave unsupported claims UNKNOWN.
