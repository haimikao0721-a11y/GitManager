#!/usr/bin/env python3
"""Create a disposable Git repo with branches, merges and a stash for UI testing."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return result.stdout.strip()


def commit(repo: Path, message: str, filename: str, content: str) -> None:
    (repo / filename).write_text(content, encoding="utf-8")
    git(repo, "add", filename)
    git(repo, "commit", "-m", message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=None)
    args = parser.parse_args()

    repo = args.path or Path(tempfile.mkdtemp(prefix="git-switcher-v2-fixture-"))
    repo.mkdir(parents=True, exist_ok=True)
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "Fixture User")
    git(repo, "config", "user.email", "fixture@example.com")
    git(repo, "remote", "add", "origin", "https://github.com/fixture/fixture.git")

    commit(repo, "initial", "README.md", "# Fixture\n")
    commit(repo, "main: second", "main.txt", "main 2\n")
    git(repo, "branch", "feature/a")
    git(repo, "switch", "feature/a")
    commit(repo, "feature: A1", "feature.txt", "A1\n")
    commit(repo, "feature: A2", "feature.txt", "A2\n")
    git(repo, "switch", "main")
    commit(repo, "main: third", "main.txt", "main 3\n")
    git(repo, "merge", "--no-ff", "feature/a", "-m", "merge feature/a")
    git(repo, "branch", "feature/b")
    git(repo, "switch", "feature/b")
    commit(repo, "feature: B1", "b.txt", "B1\n")
    git(repo, "switch", "main")
    (repo / "stash.txt").write_text("stash me\n", encoding="utf-8")
    git(repo, "stash", "push", "-m", "fixture stash", "-u")
    commit(repo, "main: after stash", "main.txt", "main 4\n")
    git(repo, "tag", "v1.0-fixture")

    print(repo)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
