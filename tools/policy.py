#!/usr/bin/env python3
"""Deterministic import/build boundary checks; not a semantic correctness proof."""
import ast
import gzip
import json
from pathlib import Path
import re
import sys
ROOT=Path(__file__).resolve().parents[1]
# Regression budget for the shipped ESM bundle, not a size claim; `make metrics` prints the measured value.
GZIP_BUDGET=14000
def checks():
    errors=[]
    p=json.loads((ROOT/'package.json').read_text())
    if p.get('dependencies',{})!={} or p.get('peerDependencies',{})!={} or p.get('sideEffects') is not False:
        errors.append('router must have zero runtime/peer dependencies and no entry side effects')
    for f in (ROOT/'src').glob('*.ts'):
        for spec in re.findall(r'(?:from\s+|import\s*)["\']([^"\']+)["\']',f.read_text()):
            if not spec.startswith('./'): errors.append(f'nonlocal import {f.name}: {spec}')
        if re.search(r'tauri|std::process|child_process',f.read_text()):errors.append(f'forbidden native/process reference: {f.name}')
    bundle=ROOT/'dist/index.js'
    if bundle.exists():
        code=bundle.read_text()
        # VERIFIED: a self-contained bundle is what makes dist/index.js usable as a plain browser module
        # (the README snippet imports it unbundled in Chromium); a stray import would break that silently.
        if re.search(r'^\s*import\s|\brequire\(|\bimport\(',code,re.M):errors.append('dist/index.js imports another module')
        if len(gzip.compress(code.encode(),9))>GZIP_BUDGET:errors.append(f'router bundle gzip regression budget >{GZIP_BUDGET:,} bytes')
    else:
        errors.append('dist/index.js missing; run make build')
    for f in (ROOT/'tools').glob('*.py'):ast.parse(f.read_text(),filename=str(f))
    for name,limit in [('MEMORY.md',4096),('CLI_GIST.md',2048)]:
        if (ROOT/'.agents'/name).stat().st_size>limit:errors.append('agent memory over budget')
    for name in ['README.md','ARCH.md','AGENTS.md','tools/vae.lock.json']:
        if not (ROOT/name).is_file():errors.append('missing '+name)
    return errors
if __name__=='__main__':
    errors=checks()
    for e in errors:print('FAILED[policy]:',e)
    print('VERIFIED[policy]='+str(not errors).lower());sys.exit(bool(errors))
