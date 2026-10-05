#!/usr/bin/env python3
"""Install the actual pinned VAE plugin, never a reconstructed substitute.

VERIFIED: commit and Git-blob validation use Git/stdout and hashlib, not a moving branch.
The caller explicitly authorizes development-dependency installation via make setup.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def git(args: list[str], cwd: Path) -> str:
    proc = subprocess.run(["git", "-c", "core.autocrlf=false", *args], cwd=cwd, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=180)
    if proc.returncode:
        raise RuntimeError(f"git {' '.join(args[:2])} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def blob_hash(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def read_lock(root: Path) -> dict:
    lock = json.loads((root / "tools/vae.lock.json").read_text("utf8"))
    if lock.get("schema") != 1 or not re.fullmatch(r"[a-f0-9]{40}", lock.get("commit", "")):
        raise ValueError("Invalid pinned VAE lock")
    if lock.get("plugin") != "plugin":
        raise ValueError("VAE plugin root must be plugin")
    if not isinstance(lock.get("scripts"), dict) or not lock["scripts"]:
        raise ValueError("VAE lock has no verified script blobs")
    for name, digest in lock["scripts"].items():
        if name.startswith("/") or ".." in Path(name).parts or not re.fullmatch(r"[a-f0-9]{40}", digest):
            raise ValueError("Invalid VAE script pin")
    return lock


def validate_install(root: Path, installed: Path | None = None) -> Path:
    lock = read_lock(root)
    location = installed or root / "vendor/defuss-vae"
    if not location.is_dir():
        raise RuntimeError("Pinned defuss-vae is not installed. Run make setup (network required), or tools/bootstrap_vae.py --source /path/to/exact/clone.")
    if git(["rev-parse", "HEAD"], location) != lock["commit"]:
        raise RuntimeError("VAE checkout does not match its pinned commit")
    # Imports create bytecode unless disabled; ignore only that non-source runtime output.
    if git(["status", "--porcelain", "--untracked-files=no"], location):
        raise RuntimeError("VAE tracked files were modified; do not trust this gate")
    untracked = git(["ls-files", "--others", "--exclude-standard"], location).splitlines()
    if any("__pycache__" not in Path(path).parts or not path.endswith(".pyc") for path in untracked):
        raise RuntimeError("VAE checkout contains untracked files; refusing possible Python import shadowing")
    for name, digest in lock["scripts"].items():
        path = location / name
        if path.is_symlink() or blob_hash(path.read_bytes()) != digest:
            raise RuntimeError(f"VAE script failed Git-blob integrity: {name}")
    return location / lock["plugin"]


def install(root: Path = ROOT, source: str | None = None) -> Path:
    lock = read_lock(root)
    destination = root / "vendor/defuss-vae"
    if destination.exists():
        return validate_install(root)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".vae-install-", dir=destination.parent))
    try:
        git(["clone", "--no-checkout", "--no-hardlinks", "--", source or lock["repository"], str(temporary / "repo")], root)
        repo = temporary / "repo"
        git(["checkout", "--detach", lock["commit"]], repo)
        validate_install(root, repo)
        os.rename(repo, destination)
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
    return validate_install(root)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", help="Existing Git clone; still requires the exact pinned commit and blob hashes")
    args = parser.parse_args()
    try:
        print(f"VERIFIED[vae.install]=true path={install(source=args.source)}")
        return 0
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f"UNKNOWN[vae.install]: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
