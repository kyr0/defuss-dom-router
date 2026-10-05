#!/usr/bin/env python3
"""Small adapter around upstream VAE; never auto-attest review or documentation.

VERIFIED: this adapter fixes the baseline at HEAD, checks index/worktree equality before
commit, and validates the pinned plugin before importing its actual gate implementation.
UNKNOWN: host-specific Claude/Codex hook parity; the Git adapter is the portable backstop.
"""
from __future__ import annotations
import argparse
import importlib
import json
from pathlib import Path
import re
import subprocess
import sys
from bootstrap_vae import ROOT, git, validate_install
from fingerprint import source_fingerprint


def require_repo(root: Path) -> str:
    toplevel = Path(git(["rev-parse", "--show-toplevel"], root)).resolve()
    if toplevel != root.resolve():
        raise RuntimeError("The packaged VAE policy must run at its Git repository root. For a defuss monorepo integration, merge the policy at that root; see docs/MIGRATION.md. Refusing a silently wrong diff scope.")
    try:
        return git(["rev-parse", "HEAD"], root)
    except RuntimeError:
        return "unborn"


def index_matches_worktree(root: Path) -> None:
    result = subprocess.run(["git", "diff", "--quiet", "--"], cwd=root, check=False)
    if result.returncode != 0:
        raise RuntimeError("Commit denied: tracked worktree differs from the index. Stage the reviewed content and rerun the gate.")


def ensure_state(root: Path, head: str) -> tuple[str, Path]:
    session = f"defuss-{head[:16]}"
    folder = root / "tmp/vae" / session
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "state.json"
    baseline = {"head": None if head == "unborn" else head, "dirty": {}}
    state = json.loads(path.read_text()) if path.exists() else {}
    # A dirty snapshot baseline would silently exclude edits; never permit that here.
    if state and state.get("baseline") != baseline:
        raise RuntimeError("Unexpected VAE session baseline; inspect it instead of silently excluding changes")
    if not state:
        state = {"schema": 1, "repo": str(root), "session_id": session, "baseline": baseline, "verified_fp": None, "gate_runs": 0}
    key = source_fingerprint(root)
    if state.get("adapter_inputs") != key:
        state["verified_key"] = None
        state["adapter_inputs"] = key
    path.write_text(json.dumps(state, indent=2) + "\n")
    return session, folder


def run_gate(root: Path = ROOT, commit: bool = False) -> bool:
    head = require_repo(root)
    if commit:
        index_matches_worktree(root)
    plugin = validate_install(root)
    session, _ = ensure_state(root, head)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(plugin / "scripts"))
    upstream = importlib.import_module("vae_gate")
    before = source_fingerprint(root)
    result = upstream.gate(root, session, plugin)
    if source_fingerprint(root) != before:
        raise RuntimeError("Inputs changed while the gate was running; rerun verification/review")
    print(result.text)
    if commit:
        index_matches_worktree(root)
    return result.done


def install_hooks(root: Path = ROOT) -> None:
    require_repo(root)
    result = subprocess.run(["git", "config", "--get", "core.hooksPath"], cwd=root, text=True, stdout=subprocess.PIPE, check=False)
    existing = result.stdout.strip()
    desired = str(root / ".githooks")
    if existing and existing not in {desired, ".githooks"}:
        raise RuntimeError(f"Preserving existing core.hooksPath={existing}; integrate the adapters manually")
    if not existing:
        default = Path(git(["rev-parse", "--git-path", "hooks"], root))
        if not default.is_absolute():
            default = root / default
        active = [p.name for p in default.glob("*") if p.is_file() and not p.name.endswith(".sample")]
        if active:
            raise RuntimeError(f"Preserving existing Git hooks {active}; integrate manually")
    git(["config", "--local", "core.hooksPath", desired], root)
    print(f"VERIFIED[git.hooks.installed]=true path={desired}")


def conventional_message(path: Path) -> bool:
    lines = [line for line in path.read_text("utf8").splitlines() if line and not line.startswith("#")]
    return bool(lines and re.fullmatch(r"(?:feat|fix|docs|refactor|perf|test|build|ci|chore|revert)(?:\([^\n()]+\))?!?: .+", lines[0]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["gate", "commit", "install-hooks", "commit-msg"])
    parser.add_argument("message", nargs="?")
    args = parser.parse_args()
    try:
        if args.command == "install-hooks":
            install_hooks()
            return 0
        if args.command == "commit-msg":
            if not args.message or not conventional_message(Path(args.message)):
                raise RuntimeError("Use a Conventional Commit, for example feat(router): support named links")
            return 0
        return 0 if run_gate(commit=args.command == "commit") else 2
    except (OSError, RuntimeError, ValueError, ImportError, subprocess.SubprocessError) as error:
        print(f"UNKNOWN[agent.gate]: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
