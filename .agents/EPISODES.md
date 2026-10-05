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
