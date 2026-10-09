# Agent engineering contract
Read README.md, ARCH.md and `.agents/MEMORY.md` before editing. The public API is `src/types.ts`.

Use the actual pinned defuss-vae under vendor/defuss-vae; `make setup` installs it, `make agent-init` opts into Git hooks, `make gate` invokes verify → review → docs. Do not self-trigger upstream human-only skills. Never synthesize a review attestation to make the gate green.

Keep URL parsing/matching pure and renderer-independent. Preserve zero runtime dependencies, a self-contained `dist/index.js`, the callback contracts and canonical URI mapping. Run `make verify`; `make verify-fast` is NOT the browser gate. Missing tools or managed-browser restrictions are UNKNOWN, not a skip/pass. Do not remove or bypass enterprise browser policy.

New failure classes need a regression test. No fake Window/history, mock frameworks, hand-entered coverage or external service ownership. Browser evidence must consume built artifacts. Use the real History API in a real browser for history claims; `ROUTER_BROWSERS=chromium,firefox,webkit make e2e` is the release matrix. Do not claim bundle-size improvements without `make metrics` observations.

Use explicit scope disposers and side-effect-free imports. Application callbacks must not mutate live DOM during prepare, await their own navigation/destroy, or launch uncancelled delayed writes. Existing commits serialize; arbitrary JS cannot be force-cancelled or rolled back.

defuss-tauri and its native link client live in a separate repository; do not add native or Tauri code here. When integrating into the parent defuss repo, merge root policy/Makefile/hooks; never create a nested .git to evade root scope. No remote writes or publishing without explicit authorization.

<!-- defuss-vae:start -->
## defuss-vae
Read `.agents/MEMORY.md` + `.agents/CLI_GIST.md` before engineering work; `grep` `.agents/EPISODES.md` for recurring failures.
Outside skills write plain concise prose.
Evidence > assumption: IF a runtime fact is unknown or contested THEN observe before editing (read → existing test/command → smallest discriminating probe → ask). Temporary probe lines carry `vae:probe` and the gate rejects leftovers; read logs bounded (`make log`, tail, grep); no log spraying.
Layout: `.agents/` agent state; `Makefile` verbs setup start stop status log metrics bench test coverage lint e2e verify (`make` lists them); services only via `make start` → `var/log/<svc>.stdout|.stderr`, `tmp/<svc>.pid` (gitignored); programs read `input/`, write `output/` (both gitignored; commit e2e fixtures via `!input/<file>`).
test=real subsystems in isolation (throwaway db|queue|filesystem|server process, no mocks), never live|production data or services; tests assert VERIFIED requirements only (spec|human|observed contract): HYPOTHESIS → probe, UNKNOWN → ask, neither gets a test; coverage is Pareto: test the untested public behaviors + main error paths, not lines (gate floor 60%); a regression test only for a VERIFIED code defect, never pinning env|config values that worked once (fix + validate at startup instead); e2e=build the publishable artifact and consume it like a user, covering EVERY page|route|screen|component of a UI (real Playwright browser) and EVERY CLI command|API endpoint at least once. The gate fails closed without `.agents/VERIFY.py`, any verb, or `verify` running lint test coverage e2e, and when e2e leaves no fresh file in `output/`. CI runs async: after a push report the run URL and finish, NOT wait for it (`gh run watch`), since the local gate is the proof (`init` writes `.github/workflows/verify.yml`; commands in `CONFIG["ci"]`).
Toolchain: tool versions pinned in `mise.toml` (`make setup` runs `mise install`) and the ecosystem's own pin; new projects and subprojects start on `bun` (JS/TS, `bun init`) or `uv` (Python, `uv init`), never npm/yarn/pnpm/pip/poetry (their new lockfiles fail the gate); other stacks: the plugin's `references/STACKS.md`. An existing toolchain stays unless the human approves migrating; propose it.
Habits: separate concerns (pure core logic; I/O, config and framework glue at the edges) in small single-purpose modules testable with real inputs; split by responsibility, never speculatively. Logs: one line per event, ISO-8601 UTC timestamp first (`2026-10-01T12:00:00.123Z`), then level, message, key=value; never secrets. Config: env vars from a gitignored `.env`, exported by the Makefile to every recipe and the app; every key the code reads stays in `.env.example` without secret values (gate-checked); validate config once at startup, fail fast. Services exit cleanly on SIGTERM.
Long runs: check free disk before big writes, CPU|RAM|GPU before heavy jobs (`vae.py swarm status`); run them detached from the shell (an SSH drop cannot kill them) with a pid file and a log appended per line with an ISO-8601 timestamp: services `make start`, jobs `vae.py swarm spawn`. Local HTTPS|reverse proxy: Caddy's internal CA (`caddy reverse-proxy --from localhost:8443 --to :3000`).
Sub-agents (hard rule): split only into units with disjoint target paths AND explicit contracts, else stay sequential; one git worktree per unit, outside the repo (`../<repo>.wt/<name>`) or, IF writes there are blocked, `tmp/worktrees/<name>` excluded from test discovery (without git: a directory no other agent claims), small chunks, results on disk early; spawned sessions never run `wrap`; register|update|remove only via `vae.py swarm` (`.agents/SWARM_STATUS.yaml`: one entry per live agent, owner-written, re-checked after 3 s); the orchestrator runs `vae.py swarm status` on a timer (harness scheduler|cron) every ~ETA/4, 5 to 30 min, and never trusts silence.
Epistemics: `VERIFIED`=direct evidence; `HYPOTHESIS`=testable inference + falsifier; `UNKNOWN`=not established. Never promote or widen by rhetoric|repetition|recency|detail.
Ponytail: understand → YAGNI → reuse → stdlib → native → installed dependency → minimum code; bug fix=root cause + sibling callers.
Docs: why this design beats a plausible alternative; prefix material claims `VERIFIED:`|`HYPOTHESIS:`|`UNKNOWN:`. Pages (`*.md|*.mdx`) are gated: `vae.py prose --fix`, rewrite the rest by meaning against the plugin's `references/PROSE.md`; schematic content → a rendered Mermaid diagram; `README.md` per package with a CLI|API, `ARCH.md` (why + how, operations, security, privacy) per package with production code, both VERIFIED facts only.
Lessons: test|`.agents/VERIFY.py` rule > MEMORY line > EPISODES line; an entry binds only in its evidenced `[scope]`, below the current request; narrow|rewrite|drop disproved ones.
Stack defaults (plugin `references/STACKS.md`):
js lint: `bunx oxlint --deny-warnings` (plain oxlint exits 0 on findings)
js test: `bun test`; a Vite app: `vitest run`, which shares the Vite config and transforms
js coverage: `bun test --coverage` (vitest: `vitest run --coverage` with `@vitest/coverage-v8`)
js e2e: `bun pm pack`, then `bun add <tgz>` in a clean consumer that runs on `input/`
js pin: `packageManager` in `package.json`; new packages are ESM, libraries build with pkgroll; never npm, yarn or pnpm.
python lint: `uv run ruff check .`
python test: `uv run pytest`
python coverage: `uv run pytest --cov`
python e2e: `uv build`, then `uv run --isolated --no-project --with dist/<wheel>` on `input/`
python pin: `uv.lock`; `uv run --env-file .env` loads config; never pip or poetry; no venv activation, which agent shells do not keep.
web e2e: the built app, served via `make start`, driven in a real Playwright browser (`bunx playwright install --with-deps chromium` or `uv run playwright install --with-deps chromium`): WebGL2 on GPU-less CI via the launch args `--use-angle=swiftshader --enable-unsafe-swiftshader`, real network, permissions via `context.grantPermissions([...])` (Python `grant_permissions`); fail on console errors and failed requests; the report (`outputDir`) goes to `output/`.
web https: Caddy's internal CA covers `localhost` (trusted on first run): `caddy reverse-proxy --from localhost:8443 --to :3000`, static files `caddy file-server --domain localhost --root <dir>`.
<!-- defuss-vae:end -->
