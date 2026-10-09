# Optional peer consumers

Run `make examples`, then serve the repository root as described in the main README. The downloader keeps exact package versions, npm integrity checks, raw asset hashes, upstream provenance and licenses in `vendor/MANIFEST.json`.

`index.html` renders through defuss-query 0.2.0 with defuss-morph 0.2.0; `index.html?renderer=morph` calls morph directly. `shadcn.html` loads only shadcn's core from commit 9cc6c9366dc8cd85934a487db2ab408bf70008d2, which already embeds query 0.1.1 and morph 0.1.1; never load the standalone pair on that page.

Downloading needs network access only for `make examples`; afterwards the pages load local files only. The script refuses symlink and path-traversal archive members, writes only the named `vendor/` files and fails on network or registry errors instead of installing a substitute renderer. Without `vendor/`, the pages show an error asking you to run `make examples`.

All three pages render their initial route, follow a router link and return with Back in one document in Chromium, Firefox and WebKit, checked with Playwright 1.58.2 on 2026-10-06. That check is not part of `make verify`.
