# Commands
`make setup`: Bun deps, pinned VAE, Playwright browsers, then build.
`make build`: pkgroll → dist/; test-only internal bundle → tmp/units/.
`make lint`: tsc --noEmit, oxlint --deny-warnings, tools/policy.py.
`make test`: Node tests on the build, packed-tarball consumer, Python VAE adapter tests.
`make coverage`: merged Node + Chromium line coverage of dist/index.js; floor 60%.
`make e2e`: browser suite; `ROUTER_BROWSERS=chromium,firefox,webkit make e2e` is the release matrix.
`make browser-primitives`: History/link units on Chromium about:blank, not HTTP integration.
`make verify`: lint, test, coverage, e2e. Missing/blocked engine fails.
`make examples`: build + pinned query/morph/shadcn assets for examples/peers/.
`make agent-init && make gate`: Git hooks + upstream verify/review/docs at the repo root.
