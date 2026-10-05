# Project memory
- VERIFIED: the router has no production dependencies; rendering enters through prepare/commit. Native shells (defuss-tauri, separate repo) only call navigate().
- VERIFIED: programmatic veto must occur before history writes; tracked popstate veto uses corrective history.go within one session.
- VERIFIED: dist/ is pkgroll output; tmp/units/ is a test-only bundle of internal modules (tests/units.ts). Never export internals from the package for tests.
- VERIFIED: browser tests run one fresh, fully loaded document per test. During document load, location navigations replace instead of push (HTML spec); WebKit throws SecurityError after 100 history.replaceState/pushState calls per 10 s per document.
- VERIFIED: Node cannot reach the coordinator without a real Window; make coverage merges Node and Chromium V8 coverage of dist/index.js. Never fake a Window to raise Node coverage.
- VERIFIED: peer runtimes are optional assets; make examples must run before examples/peers/ works offline.
- VERIFIED: VAE must be the pinned upstream dependency. Do not invent attestations or change verifier scope to hide failures.
