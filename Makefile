NODE ?= node
PYTHON ?= python3
.PHONY: setup build lint test coverage e2e browser-primitives verify verify-fast gate agent-init examples start stop restart status log metrics bench
setup:
	bun install --frozen-lockfile
	$(PYTHON) tools/bootstrap_vae.py
	bunx playwright install chromium firefox webkit
	$(MAKE) build
# dist/ is the package (pkgroll); tmp/units/ bundles internal modules for unit tests only and is never published.
build:
	bun run build
	bun build tests/units.ts --target=browser --format=esm --outfile=tmp/units/units.js
lint: build
	bunx tsc --noEmit
	bunx oxlint --deny-warnings
	$(PYTHON) tools/policy.py
test: build
	$(NODE) tools/test.mjs
	$(PYTHON) -m unittest discover -s tests -p 'test_*.py' -v
coverage: build
	$(NODE) tools/coverage.mjs
e2e: build
	$(NODE) tools/browser.mjs
browser-primitives: build
	$(NODE) tools/browser-primitives.mjs
verify-fast: lint test coverage
verify: lint test coverage e2e
gate:
	$(PYTHON) tools/agent.py gate
agent-init:
	$(PYTHON) tools/agent.py install-hooks
# Builds the router and downloads the pinned query/morph/shadcn assets used by examples/peers/.
examples: build
	$(PYTHON) tools/vendor_examples.py
# A library has no managed service; README shows how to serve the examples explicitly.
start stop restart status log:
	@echo "∅ $@: no service (library)"
metrics: build
	@$(NODE) -e "const z=require('node:zlib'),f=require('node:fs');for(const n of ['index.js','index.cjs']){const b=f.readFileSync('dist/'+n);console.log(n,b.length,'bytes',z.gzipSync(b,{level:9}).length,'gzip',z.brotliCompressSync(b).length,'brotli')}"
bench:
	@echo "No performance benchmark claim. make metrics reports measured artifact sizes."
