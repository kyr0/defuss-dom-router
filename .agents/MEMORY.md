# Project memory
- VERIFIED[tests]: tmp/units/ (tests/units.ts) is the only way tests reach internal modules; never export internals from the package for tests BC the public surface is the contract tests/package.test.mjs checks.
- VERIFIED[tests/browser]: one fresh, fully loaded document per test BC during document load location navigations replace instead of push (HTML spec).
- VERIFIED[tests/browser@webkit]: WebKit throws SecurityError after 100 history.replaceState/pushState calls per 10 s per document BC observed in the e2e matrix; a shared document would hit it.
- VERIFIED[tools/docs-browser.mjs]: the site e2e runs with reducedMotion 'reduce' BC with smooth page scroll a Firefox click inside the demo frame landed on the floating header (2 of 9 runs failed, 5 of 5 pass after).
- VERIFIED[docs/demo]: demo screens show measured or session values, never invented figures BC review found fabricated report statistics on the Reports screen; it now counts the session's log.
