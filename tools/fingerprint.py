#!/usr/bin/env python3
"""Content-address all code, tests, policy and build inputs, so cached VAE verification expires on any change.

VERIFIED: dist/ outputs, evidence and dependencies are excluded. Shipped package documents, local example assets and the website (docs/) are included.
"""
from __future__ import annotations
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TREES = ("src", "tests", "tools", ".githooks", ".github", "examples", "docs")
FILES = ("package.json", "README.md", "SKILL.md", "LICENSE", "tsconfig.json", "Makefile", ".gitattributes", ".gitignore", ".env.example", "bun.lock", "bun.lockb", ".agents/VERIFY.py")


def source_fingerprint(root: Path = ROOT) -> str:
    paths: set[Path] = {root / name for name in FILES if (root / name).is_file()}
    for name in TREES:
        for path in (root / name).rglob("*"):
            relative = path.relative_to(root)
            if path.is_file() and not any(part in {"__pycache__", "node_modules", "dist", "output", "vendor"} for part in relative.parts):
                paths.add(path)
    result = hashlib.sha256()
    for path in sorted(paths, key=lambda p: p.relative_to(root).as_posix()):
        if path.is_symlink():
            raise ValueError(f"Symlink input is not fingerprintable: {path}")
        result.update(path.relative_to(root).as_posix().encode() + b"\0")
        result.update(hashlib.sha256(path.read_bytes()).digest())
    return result.hexdigest()


if __name__ == "__main__":
    print(source_fingerprint())
