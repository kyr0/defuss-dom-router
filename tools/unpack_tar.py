#!/usr/bin/env python3
"""Extract an npm package for isolated-consumer tests, not into the source checkout."""
from pathlib import Path, PurePosixPath
import sys
import tarfile

def unpack(archive: Path, destination: Path) -> None:
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=False)
    seen: set[str] = set()
    total = 0
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            path = PurePosixPath(member.name)
            if not path.parts or path.parts[0] != 'package' or path.is_absolute() or '..' in path.parts or '\\' in member.name:
                raise ValueError('Invalid npm package path')
            if member.isdir():
                continue
            if not member.isfile() or member.name in seen:
                raise ValueError('Special or duplicated archive member')
            seen.add(member.name)
            total += member.size
            if total > 50 * 1024 * 1024:
                raise ValueError('Archive exceeds test extraction budget')
            out = destination.joinpath(*path.parts[1:])
            out.parent.mkdir(parents=True, exist_ok=True)
            stream = tar.extractfile(member)
            if stream is None:
                raise ValueError('Unreadable archive member')
            out.write_bytes(stream.read())
            out.chmod(0o755 if member.mode & 0o111 else 0o644)

if __name__ == '__main__':
    unpack(Path(sys.argv[1]), Path(sys.argv[2]))
