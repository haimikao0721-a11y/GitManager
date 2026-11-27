#!/usr/bin/env python3
"""Check the tools needed to build Git Account Switcher v2."""

from __future__ import annotations

import shutil
import subprocess
import sys

REQUIRED = {
    "cmake": ["cmake", "--version"],
    "g++": ["g++", "--version"],
    "ninja": ["ninja", "--version"],
    "git": ["git", "--version"],
    "node": ["node", "--version"],
    "pnpm": ["pnpm", "--version"],
    "python": ["python", "--version"],
}


def first_line(command: list[str]) -> str:
    try:
        output = subprocess.check_output(command, stderr=subprocess.STDOUT, text=True)
    except Exception as error:
        return f"ERROR: {error}"
    return output.splitlines()[0] if output else ""


def main() -> int:
    missing = []
    for name, command in REQUIRED.items():
        if not shutil.which(name):
            missing.append(name)
            print(f"{name:8} MISSING")
            continue
        print(f"{name:8} {first_line(command)}")
    if missing:
        print("\nMissing:", ", ".join(missing))
        return 1
    print("\nEnvironment OK. Run: python tools/pipeline/build.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
