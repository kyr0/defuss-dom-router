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
# Website
`ROUTER_BROWSERS=chromium,firefox,webkit node tools/docs-browser.mjs`: the site e2e alone, all engines (needs jsDelivr).
VERIFIED 2026-10-09: GitHub Pages serves main /docs at https://dom-router.defuss.org (`gh api repos/kyr0/defuss-dom-router/pages`); docs/CNAME holds the domain; a push to main redeploys.
VERIFIED 2026-10-09: agent shells have no SSH key; push with `git -c credential.helper='!gh auth git-credential' push https://github.com/kyr0/defuss-dom-router.git main`.
