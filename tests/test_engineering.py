"""Real temporary Git repositories test the VAE adapter's enforcement boundary."""
from __future__ import annotations
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from agent import conventional_message, ensure_state, index_matches_worktree, install_hooks, require_repo
from bootstrap_vae import blob_hash, install, read_lock, validate_install
from fingerprint import source_fingerprint


def git(root, *args):
    return subprocess.check_output(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()


class EngineeringTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="defuss-engineering-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def repository(self):
        git(self.root, "init", "-q")
        (self.root / "src").mkdir()
        (self.root / "src/example.ts").write_text("export const example = 1;\n")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "test: initial fixture")
        return self.root

    def test_git_scope_and_index_guard(self):
        root = self.repository()
        self.assertEqual(require_repo(root), git(root, "rev-parse", "HEAD"))
        index_matches_worktree(root)
        (root / "src/example.ts").write_text("export const example = 2;\n")
        with self.assertRaisesRegex(RuntimeError, "worktree differs"):
            index_matches_worktree(root)
        git(root, "add", "src/example.ts")
        index_matches_worktree(root)
        with self.assertRaisesRegex(RuntimeError, "root"):
            require_repo(root / "src")

    def test_unborn_repository(self):
        git(self.root, "init", "-q")
        self.assertEqual(require_repo(self.root), "unborn")

    def test_baseline_never_absorbs_existing_edits(self):
        root = self.repository()
        head = require_repo(root)
        session, folder = ensure_state(root, head)
        state = json.loads((folder / "state.json").read_text())
        self.assertEqual(state["baseline"], {"head": head, "dirty": {}})
        state["baseline"]["dirty"] = {"src/example.ts": "forged"}
        (folder / "state.json").write_text(json.dumps(state))
        with self.assertRaisesRegex(RuntimeError, "baseline"):
            ensure_state(root, head)
        self.assertTrue(session.startswith("defuss-"))

    def test_policy_change_invalidates_cached_verification(self):
        root = self.repository()
        head = require_repo(root)
        _, folder = ensure_state(root, head)
        file = folder / "state.json"
        state = json.loads(file.read_text()); state["verified_key"] = "cached"
        file.write_text(json.dumps(state))
        ensure_state(root, head)
        self.assertEqual(json.loads(file.read_text())["verified_key"], "cached")
        (root / ".agents").mkdir(); (root / ".agents/VERIFY.py").write_text("CONFIG = {}\n")
        ensure_state(root, head)
        self.assertIsNone(json.loads(file.read_text())["verified_key"])

    def test_hooks_never_overwrite_existing_setup(self):
        root = self.repository()
        (root / ".githooks").mkdir()
        install_hooks(root)
        self.assertEqual(git(root, "config", "--get", "core.hooksPath"), str(root / ".githooks"))
        git(root, "config", "core.hooksPath", "existing-hooks")
        with self.assertRaisesRegex(RuntimeError, "Preserving"):
            install_hooks(root)

    def test_existing_default_git_hook_is_preserved(self):
        root = self.repository()
        (root / ".git/hooks/pre-commit").write_text("#!/bin/sh\nexit 0\n")
        with self.assertRaisesRegex(RuntimeError, "Preserving"):
            install_hooks(root)

    def test_conventional_commit_messages(self):
        path = self.root / "message"
        for message, expected in [("feat(router)!: replace history metadata\n\nBreaking change", True), ("docs: clarify browser gate", True), ("fixed it", False), ("", False), ("# comment\nfix: actual message", True)]:
            path.write_text(message)
            self.assertEqual(conventional_message(path), expected)

    def test_actual_git_clone_bootstrap_pin_and_tampering(self):
        upstream = self.root / "upstream"; upstream.mkdir()
        git(upstream, "init", "-q")
        scripts = upstream / "plugin/scripts"; scripts.mkdir(parents=True)
        script = scripts / "fixture.py"; script.write_bytes(b"print('local dependency integrity fixture')\n")
        git(upstream, "add", "."); git(upstream, "commit", "-qm", "test: dependency fixture")
        project = self.root / "project"; (project / "tools").mkdir(parents=True)
        lock = {"schema": 1, "repository": str(upstream), "commit": git(upstream, "rev-parse", "HEAD"), "plugin": "plugin", "scripts": {"plugin/scripts/fixture.py": blob_hash(script.read_bytes())}}
        (project / "tools/vae.lock.json").write_text(json.dumps(lock))
        installed = install(project, str(upstream))
        self.assertEqual(installed, project / "vendor/defuss-vae/plugin")
        self.assertEqual(validate_install(project), installed)
        (installed / "scripts/untracked.py").write_text("injected = True\n")
        with self.assertRaisesRegex(RuntimeError, "untracked"):
            validate_install(project)
        (installed / "scripts/untracked.py").unlink()
        (installed / "scripts/fixture.py").write_text("changed = True\n")
        with self.assertRaisesRegex(RuntimeError, "modified"):
            validate_install(project)

    def test_missing_upstream_is_unknown_not_success(self):
        (self.root / "tools").mkdir(); shutil.copy(ROOT / "tools/vae.lock.json", self.root / "tools/vae.lock.json")
        with self.assertRaisesRegex(RuntimeError, "not installed"):
            validate_install(self.root)
        data = read_lock(self.root); data["commit"] = "main"; (self.root / "tools/vae.lock.json").write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            read_lock(self.root)

    def test_fingerprint_ignores_outputs_but_tracks_code_and_policy(self):
        (self.root / "src").mkdir(); source = self.root / "src/a.ts"; source.write_text("a")
        a = source_fingerprint(self.root)
        (self.root / "output").mkdir(); (self.root / "output/log").write_text("run")
        self.assertEqual(source_fingerprint(self.root), a)
        source.write_text("b"); self.assertNotEqual(source_fingerprint(self.root), a)

    def test_fingerprint_tracks_shipped_package_documents(self):
        (self.root / "src").mkdir(); (self.root / "src/a.ts").write_text("a")
        for name in ("README.md", "SKILL.md", "LICENSE"):
            (self.root / name).write_text("v1")
            before = source_fingerprint(self.root)
            (self.root / name).write_text("v2")
            self.assertNotEqual(source_fingerprint(self.root), before, name)

    def test_fingerprint_tracks_the_website(self):
        (self.root / "docs/assets").mkdir(parents=True); page = self.root / "docs/index.html"; page.write_text("v1")
        before = source_fingerprint(self.root)
        page.write_text("v2"); self.assertNotEqual(source_fingerprint(self.root), before)
        changed = source_fingerprint(self.root)
        (self.root / "docs/assets/site.js").write_text("x"); self.assertNotEqual(source_fingerprint(self.root), changed)


if __name__ == "__main__":
    unittest.main()
