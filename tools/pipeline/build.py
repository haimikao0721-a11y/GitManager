#!/usr/bin/env python3
"""Build the C++ core, the TypeScript UI, and assemble a portable dist folder."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "core"
APP = ROOT / "app"
DIST = ROOT / "dist"
RELEASE = ROOT / "release"


def which(name: str) -> str | None:
    return shutil.which(name)


def run(command: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    printable = " ".join(str(part) for part in command)
    print(f"\n> {printable}")
    subprocess.run(command, cwd=cwd, env=env, check=True)


def pnpm(*args: str, cwd: Path = APP) -> None:
    exe = which("pnpm") or which("pnpm.cmd")
    if not exe:
        raise SystemExit("pnpm not found. Install Node.js and pnpm first.")
    run(["cmd.exe", "/c", exe, *args], cwd=cwd)


def check_environment() -> None:
    required = ["cmake", "g++", "git", "node", "pnpm", "python"]
    missing = [name for name in required if not which(name)]
    if missing:
        raise SystemExit(f"Missing required tools: {', '.join(missing)}")
    print("cmake :", subprocess.check_output(["cmake", "--version"], text=True).splitlines()[0])
    print("g++   :", subprocess.check_output(["g++", "--version"], text=True).splitlines()[0])
    print("node  :", subprocess.check_output(["node", "--version"], text=True).strip())
    print("pnpm  :", subprocess.check_output(["cmd.exe", "/c", which("pnpm") or "pnpm", "--version"], text=True).strip())


def build_core() -> Path:
    build_dir = CORE / "build"
    build_dir.mkdir(parents=True, exist_ok=True)
    run(
        [
            "cmake",
            "-S",
            str(CORE),
            "-B",
            str(build_dir),
            "-G",
            "Ninja",
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_CXX_COMPILER=g++",
        ]
    )
    run(["cmake", "--build", str(build_dir), "--parallel"])
    core_exe = build_dir / "gitcore.exe"
    if not core_exe.exists():
        raise SystemExit(f"core build did not produce {core_exe}")
    return core_exe


def build_ui(skip_install: bool) -> None:
    if not skip_install:
        pnpm("install")
    pnpm("typecheck")
    pnpm("build")
    if not (APP / "out" / "renderer" / "index.html").exists():
        raise SystemExit("UI build did not produce app/out/renderer/index.html")


def test_core(core_exe: Path) -> None:
    run([str(core_exe), "--selftest"], env={**os.environ, "GIT_SWITCHER_V2_DATA": str(CORE / "build" / "data")})


def test_integration(core_exe: Path) -> None:
    run([
        sys.executable,
        str(ROOT / "tools" / "pipeline" / "test_core.py"),
        "--core",
        str(core_exe),
        "--web",
        str(APP / "out" / "renderer"),
    ])


def assemble(core_exe: Path) -> None:
    # Keep dist/data (config, browser profile, backups) across rebuilds.
    DIST.mkdir(parents=True, exist_ok=True)
    for name in ("gitcore.exe", "Git账户切换器.exe", "Git管理器.exe", "web", "启动.ps1", "README.md", "README.en.md", "CHANGELOG.md", "VERSION", "docs", "assets", "app.lnk", "Git账户切换器.lnk"):
        target = DIST / name
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
    shutil.copy2(core_exe, DIST / "gitcore.exe")
    launcher_exe = core_exe.parent / "launcher.exe"
    if launcher_exe.exists():
        shutil.copy2(launcher_exe, DIST / "Git管理器.exe")
    shutil.copytree(APP / "out" / "renderer", DIST / "web")
    shutil.copy2(ROOT / "启动.ps1", DIST / "启动.ps1")
    for name in ("README.md", "README.en.md", "VERSION", "CHANGELOG.md", "LICENSE"):
        source = ROOT / name
        if source.exists():
            shutil.copy2(source, DIST / name)
    docs = ROOT / "docs"
    if docs.exists():
        shutil.copytree(docs, DIST / "docs")
    assets = ROOT / "assets"
    if assets.exists():
        shutil.copytree(assets, DIST / "assets")
    print(f"\nPortable build ready: {DIST}")
    print("Run dist/Git管理器.exe or dist/启动.ps1.")


def package_release() -> Path:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip() or "0.0.1"
    RELEASE.mkdir(parents=True, exist_ok=True)
    archive_name = f"GitCore-v{version}-win-x64"
    zip_path = RELEASE / f"{archive_name}.zip"
    if zip_path.exists():
        zip_path.unlink()

    include_items = (
        "Git管理器.exe",
        "gitcore.exe",
        "web",
        "assets",
        "docs",
        "README.md",
        "README.en.md",
        "CHANGELOG.md",
        "VERSION",
        "LICENSE",
        "启动.ps1",
    )

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name in include_items:
            item = DIST / name
            if not item.exists():
                continue
            if item.is_file():
                zf.write(item, f"{archive_name}/{name}")
            else:
                for child in sorted(item.rglob("*")):
                    if child.is_file():
                        rel = child.relative_to(DIST).as_posix()
                        zf.write(child, f"{archive_name}/{rel}")

    print(f"Release archive ready: {zip_path}")
    return zip_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-install", action="store_true", help="skip pnpm install")
    parser.add_argument("--skip-tests", action="store_true", help="skip core selftest")
    parser.add_argument("--core-only", action="store_true", help="build only the C++ core")
    parser.add_argument("--ui-only", action="store_true", help="build only the UI")
    parser.add_argument("--package", action="store_true", help="also create release zip archive (excludes data/)")
    args = parser.parse_args()

    check_environment()
    if not args.ui_only:
        core_exe = build_core()
        if not args.skip_tests:
            test_core(core_exe)
    if not args.core_only:
        build_ui(args.skip_install)
    if not args.ui_only and not args.core_only and not args.skip_tests:
        test_integration(core_exe)
    if not args.ui_only:
        assemble(core_exe)
        if args.package:
            package_release()
    return 0


if __name__ == "__main__":
    sys.exit(main())
