#!/usr/bin/env python3
"""Explicit optional asset acquisition. VERIFIED: exact versions, bounded reads and npm SRI checks.
UNKNOWN: registry/GitHub availability; missing upstream assets cause a nonzero exit, never a fallback shim.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SHADCN = "9cc6c9366dc8cd85934a487db2ab408bf70008d2"
MAX_BYTES = 20 * 1024 * 1024

def read_url(url: str) -> bytes:
    if not url.startswith("https://"):
        raise ValueError("HTTPS required for asset acquisition")
    request = urllib.request.Request(url, headers={"User-Agent": "defuss-router-example-assets/1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if not response.geturl().startswith("https://"):
            raise ValueError("Insecure download redirect")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("Asset exceeds bounded download limit")
    return data

def npm_assets(name: str, version: str) -> tuple[dict[str, bytes], dict]:
    endpoint = f"https://registry.npmjs.org/{name}/{version}"
    metadata = json.loads(read_url(endpoint))
    if metadata.get("name") != name or metadata.get("version") != version:
        raise ValueError("Registry returned a different package version")
    dist = metadata["dist"]
    archive = read_url(dist["tarball"])
    integrity = dist.get("integrity", "")
    valid = False
    for part in integrity.split():
        algorithm, _, expected = part.partition("-")
        if algorithm in ("sha512", "sha384", "sha256"):
            actual = base64.b64encode(hashlib.new(algorithm, archive).digest()).decode()
            valid |= actual == expected
    if not valid:
        raise ValueError("npm archive failed strong integrity validation")
    wanted = {"package/dist/all.min.js": "script", "package/LICENSE": "license"}
    assets: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar:
            # Nothing is extracted to arbitrary paths. Reject suspicious archive structure anyway.
            if member.name.startswith("/") or ".." in Path(member.name).parts or member.issym() or member.islnk():
                raise ValueError("Unsafe tar member")
            if member.name in wanted:
                if not member.isfile() or member.size > MAX_BYTES:
                    raise ValueError("Unexpected asset type/size")
                stream = tar.extractfile(member)
                if stream is None:
                    raise ValueError("Unreadable tar asset")
                assets[wanted[member.name]] = stream.read()
    if set(assets) != {"script", "license"}:
        raise ValueError("Required browser distribution or license is missing")
    return assets, {"package": name, "version": version, "metadata": endpoint,
                    "tarball": dist["tarball"], "integrity": integrity,
                    "archiveSha256": hashlib.sha256(archive).hexdigest()}

def main() -> int:
    destination = ROOT / "examples/peers/vendor"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink():
        raise ValueError("Refusing a symlink vendor directory")
    manifest: dict = {"schema": 1, "sources": [], "files": {}}
    with tempfile.TemporaryDirectory(prefix=".peers-stage-", dir=destination.parent) as temporary:
        stage = Path(temporary)
        def save(path: str, data: bytes) -> None:
            target = stage / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            manifest["files"][path] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        for name, short in (("defuss-morph", "morph"), ("defuss-query", "query")):
            assets, provenance = npm_assets(name, "0.2.0")
            save(short + ".js", assets["script"])
            save(short + ".LICENSE", assets["license"])
            manifest["sources"].append(provenance)
        base = f"https://raw.githubusercontent.com/kyr0/defuss-shadcn/{SHADCN}/"
        for source, target in (("dist/components/core.min.js", "core.js"),
                               ("dist/components/core.css", "core.css"),
                               ("dist/components/button/button.css", "button.css"),
                               ("dist/components/NOTICE.txt", "NOTICE.txt"), ("LICENSE", "LICENSE")):
            save("shadcn/" + target, read_url(base + source))
        manifest["sources"].append({"repository": "kyr0/defuss-shadcn", "commit": SHADCN,
                                    "baseUrl": base, "trust": "HTTPS + commit-addressed files; recorded SHA256 is provenance, not a signed upstream attestation"})
        (stage / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
        # Do not delete arbitrary user-owned data: only replace a directory previously created here.
        if destination.exists():
            marker = destination / "MANIFEST.json"
            if not marker.is_file() or json.loads(marker.read_text()).get("schema") != 1:
                raise ValueError("Existing vendor directory has no recognized ownership manifest")
            known = set(json.loads(marker.read_text())["files"]) | {"MANIFEST.json"}
            actual = {str(p.relative_to(destination)) for p in destination.rglob("*") if p.is_file() or p.is_symlink()}
            if actual != known or any(p.is_symlink() for p in destination.rglob("*")):
                raise ValueError("Existing vendor directory contains unowned files or symlinks")
            for relative, item in json.loads(marker.read_text())["files"].items():
                if hashlib.sha256((destination / relative).read_bytes()).hexdigest() != item["sha256"]:
                    raise ValueError("Existing vendor file was modified; preserve it before updating")
            shutil.rmtree(destination)
        stage.rename(destination)
    print("VERIFIED[optional-assets]=true; runtime assets are local; peer browser execution is a separate check")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        raise SystemExit(f"Optional asset acquisition failed: {error}")
