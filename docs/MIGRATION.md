# Integrating into the defuss monorepo

This repository is the standalone `defuss-dom-router` package. defuss-tauri, including its optional native-link client, lives in its own repository.

1. Copy `src/`, `tests/`, `tools/`, `examples/`, `package.json`, `tsconfig.json`, `README.md`, `ARCH.md`, `SKILL.md` and `LICENSE` to the monorepo's `packages/dom-router/`.
2. Merge the Makefile targets, `.agents/VERIFY.py` and the Git hook adapters with the monorepo's root engineering policy. Do not overwrite existing hooks, disable root verification or create a nested `.git`; `tools/agent.py` refuses to run anywhere but the Git root.
3. Keep the monorepo's Bun lock and add `pkgroll`, `oxlint`, `typescript`, `@types/node` and `playwright` as intentional dev-dependency updates.
4. Run `make verify` with `ROUTER_BROWSERS=chromium,firefox,webkit` in the monorepo toolchain.

The router has an explicit API instead of a global Router singleton. defuss's legacy `Route`, `RouterSlot` and `Redirect` JSX components keep their own implementation and tests; moving them onto this core needs a separate wrapper that passes the full defuss suite. The shadcn documentation's page fetch, head and overlay handling is likewise not replaced.

The original extraction plan passes a DOM `Element` to defuss-query's `html()` in one snippet. `html()` accepts markup or VNodes, not an Element, so the examples serialize app-built elements with `outerHTML`.
