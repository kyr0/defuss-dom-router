# Engineering episodes

- 2026-10-06: restructured from a two-package handoff (dom-router + defuss-tauri) to this single package; tauri moved to its own repository. WebKit e2e first failed on History write rate limits and load-time replace navigation; fixed by one loaded document per test.

2026-10-05T23:16:05Z s=2d803ce9 DONE fp=72ff8b98b309 cov=92.3% paths=.github/workflows/verify.yml,AGENTS.md,ARCH.md,Makefile(+40)
2026-10-05T23:16:05Z s=2d803ce9 FINDING tools/browser.mjs:per-test run loop learn=none: a permanently hanging test would be a fake failure in the suite; demonstrated once by probe, bound is TEST_TIMEOUT_MS in tools/browser.mjs
2026-10-05T23:16:05Z s=2d803ce9 FINDING tools/fingerprint.py:FILES learn=test: tests/test_engineering.py::test_fingerprint_tracks_shipped_package_documents
2026-10-05T23:16:05Z s=2d803ce9 FINDING tests/browser/suite.mjs:test registration learn=memory: .agents/MEMORY.md: tests run one fresh, fully loaded document per test
2026-10-05T23:16:05Z s=2d803ce9 FINDING tools/browser.mjs + tests/browser/suite.mjs (WebKit) learn=memory: .agents/MEMORY.md WebKit History rate-limit line; webkit e2e run is the check
2026-10-05T23:16:05Z s=2d803ce9 FINDING src/matcher.ts:compileRoutes control-character check learn=test: tests/router.test.mjs reject ambiguous pattern cases
2026-10-05T23:18:23Z s=2d803ce9 DONE fp=64346ef3fe10 cov=92.3% paths=.github/workflows/verify.yml,AGENTS.md,ARCH.md,Makefile(+40)
2026-10-05T23:18:23Z s=2d803ce9 FINDING tools/browser.mjs:per-test run loop learn=none: a permanently hanging test would be a fake failure in the suite; demonstrated once by probe, bound is TEST_TIMEOUT_MS in tools/browser.mjs
2026-10-05T23:18:23Z s=2d803ce9 FINDING tools/fingerprint.py:FILES learn=test: tests/test_engineering.py::test_fingerprint_tracks_shipped_package_documents
2026-10-05T23:18:23Z s=2d803ce9 FINDING tests/browser/suite.mjs:test registration learn=memory: .agents/MEMORY.md: tests run one fresh, fully loaded document per test
2026-10-05T23:18:23Z s=2d803ce9 FINDING tools/browser.mjs + tests/browser/suite.mjs (WebKit) learn=memory: .agents/MEMORY.md WebKit History rate-limit line; webkit e2e run is the check
2026-10-05T23:18:23Z s=2d803ce9 FINDING src/matcher.ts:compileRoutes control-character check learn=test: tests/router.test.mjs reject ambiguous pattern cases
2026-10-05T23:19:48Z s=2d803ce9 DONE fp=a4b410f1cd92 cov=92.3% paths=docs/MIGRATION.md,tools/agent.py
2026-10-05T23:19:48Z s=2d803ce9 FINDING tools/browser.mjs:per-test run loop learn=none: a permanently hanging test would be a fake failure in the suite; demonstrated once by probe, bound is TEST_TIMEOUT_MS in tools/browser.mjs
2026-10-05T23:19:48Z s=2d803ce9 FINDING tools/fingerprint.py:FILES learn=test: tests/test_engineering.py::test_fingerprint_tracks_shipped_package_documents
2026-10-05T23:19:48Z s=2d803ce9 FINDING tests/browser/suite.mjs:test registration learn=memory: .agents/MEMORY.md: tests run one fresh, fully loaded document per test
2026-10-05T23:19:48Z s=2d803ce9 FINDING tools/browser.mjs + tests/browser/suite.mjs (WebKit) learn=memory: .agents/MEMORY.md WebKit History rate-limit line; webkit e2e run is the check
2026-10-05T23:19:48Z s=2d803ce9 FINDING src/matcher.ts:compileRoutes control-character check learn=test: tests/router.test.mjs reject ambiguous pattern cases
2026-10-09T11:11:13Z s=04804160 DONE fp=a9c63e96e71a cov=92.3% paths=ARCH.md,Makefile,README.md,docs/assets/defuss-dom-router.js(+13)
2026-10-09T11:11:13Z s=04804160 FINDING tools/docs-browser.mjs:playground/landing learn=test: tools/docs-browser.mjs now drives every playground route and every landing-page control in make e2e.
2026-10-09T11:11:13Z s=04804160 FINDING docs/demo/app.js:views.reports learn=none: Whether demo content is invented is a reading judgment; no mechanical check distinguishes illustrative from fabricated figures.
2026-10-09T11:11:13Z s=04804160 FINDING docs/index.html:#how .ddr-outcomes learn=test: tools/docs-browser.mjs asserts unchanged before an error; tests/docs.test.mjs asserts every status keeps an outcome card.
2026-10-09T11:11:13Z s=04804160 FINDING docs/index.html:#demo .mk-section-header-desc learn=none: Contradiction between two prose units; not mechanically checkable.
2026-10-09T11:11:13Z s=04804160 FINDING docs/demo/app.css:.pg-timeline h3 learn=test: tools/docs-browser.mjs asserts #event-7 sits at the computed scroll-padding (±4px) after the anchor-only navigation.
2026-10-09T11:11:13Z s=04804160 FINDING docs/assets/site.js:document click handler learn=test: tools/docs-browser.mjs asserts the section top is 80±3px after header and menu-sheet links.
2026-10-09T11:11:13Z s=04804160 FINDING tools/docs-browser.mjs:browser.newContext learn=memory: Recorded in .agents/MEMORY.md; the context option in tools/docs-browser.mjs keeps it from recurring.
2026-10-09T11:11:13Z s=04804160 FINDING Makefile:lint, docs/demo/app.js learn=verifier: make lint runs oxlint --deny-warnings over every site script.
2026-10-09T11:11:13Z s=04804160 FINDING docs/assets/site.js, docs/demo/app.js, docs/assets/site.css, docs/demo/app.css learn=none: Duplication is a structural judgment; no rule detects copied helpers.
2026-10-09T11:11:13Z s=04804160 FINDING docs/assets/site.js:document click handler learn=none: No malformed fragment links exist on the page today; a guard, not an observed failure.
2026-10-09T11:11:13Z s=04804160 FINDING README.md:Quick start; ARCH.md:Operations Website learn=none: Reading-only prose rules; the static prose check covers the mechanical part.
2026-10-09T13:12:49Z s=04804160 DONE fp=0884ae451f03 cov=97.2% paths=ARCH.md,Makefile,README.md,docs/assets/defuss-dom-router.js(+16)
2026-10-09T13:12:49Z s=04804160 FINDING docs/demo/app.js:showError learn=test: tools/docs-browser.mjs asserts the rejected call's banner names no route after the Broken failure.
2026-10-09T13:12:49Z s=04804160 FINDING tools/coverage.mjs:9, .agents/VERIFY.py:CONFIG.coverage_min learn=verifier: make coverage and the VAE gate both fail below 90% line coverage of dist/index.js.
2026-10-09T13:12:49Z s=04804160 FINDING tests/browser/suite.mjs, tests/router.test.mjs learn=test: Each behavior now has a test against the built bundle; the coverage floor catches new untested paths.
2026-10-09T13:12:49Z s=04804160 FINDING docs/demo/app.js, docs/demo/index.html:#act-native learn=test: tools/docs-browser.mjs asserts a committed result with cause native in all three engines.
2026-10-09T13:49:48Z s=04804160 DONE fp=205888bd6700 cov=97.2% paths=ARCH.md,Makefile,README.md,docs/assets/defuss-dom-router.js(+16)
2026-10-09T14:23:40Z s=04804160 DONE fp=5fdb76135b4d cov=97.2% paths=ARCH.md,Makefile,README.md,docs/assets/defuss-dom-router.js(+16)
2026-10-09T14:25:49Z s=04804160 DONE fp=46cee4dc1b7c cov=97.2% paths=ARCH.md,Makefile,README.md,docs/assets/defuss-dom-router.js(+16)
