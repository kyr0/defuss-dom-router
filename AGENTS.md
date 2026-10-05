# Agent engineering contract
Read README.md, ARCH.md and `.agents/MEMORY.md` before editing. The public API is `src/types.ts`.

Use the actual pinned defuss-vae under vendor/defuss-vae; `make setup` installs it, `make agent-init` opts into Git hooks, `make gate` invokes verify → review → docs. Do not self-trigger upstream human-only skills. Never synthesize a review attestation to make the gate green.

Keep URL parsing/matching pure and renderer-independent. Preserve zero runtime dependencies, a self-contained `dist/index.js`, the callback contracts and canonical URI mapping. Run `make verify`; `make verify-fast` is NOT the browser gate. Missing tools or managed-browser restrictions are UNKNOWN, not a skip/pass. Do not remove or bypass enterprise browser policy.

New failure classes need a regression test. No fake Window/history, mock frameworks, hand-entered coverage or external service ownership. Browser evidence must consume built artifacts. Use the real History API in a real browser for history claims; `ROUTER_BROWSERS=chromium,firefox,webkit make e2e` is the release matrix. Do not claim bundle-size improvements without `make metrics` observations.

Use explicit scope disposers and side-effect-free imports. Application callbacks must not mutate live DOM during prepare, await their own navigation/destroy, or launch uncancelled delayed writes. Existing commits serialize; arbitrary JS cannot be force-cancelled or rolled back.

defuss-tauri and its native link client live in a separate repository; do not add native or Tauri code here. When integrating into the parent defuss repo, merge root policy/Makefile/hooks; never create a nested .git to evade root scope. No remote writes or publishing without explicit authorization.
