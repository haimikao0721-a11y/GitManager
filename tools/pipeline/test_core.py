#!/usr/bin/env python3
"""End-to-end core test: start gitcore HTTP mode, use a disposable repo, verify RPC."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tools" / "pipeline" / "make_fixture.py"

passed = 0


def check(condition: bool, label: str) -> None:
    global passed
    if not condition:
        raise AssertionError(label)
    passed += 1
    print(f"PASS  {label}")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Core:
    def __init__(self, core: Path, web: Path, work: Path, instance: str):
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.config = work / "config" / "config.json"
        self.data = work / "data"
        self.config.parent.mkdir(parents=True, exist_ok=True)
        self.data.mkdir(parents=True, exist_ok=True)
        env = {
            **os.environ,
            "GIT_SWITCHER_V2_DATA": str(self.data),
            "GIT_SWITCHER_V2_INSTANCE": instance,
        }
        self.process = subprocess.Popen(
            [
                str(core),
                "--serve",
                "--no-open",
                "--web-root",
                str(web),
                "--port",
                str(self.port),
                "--config",
                str(self.config),
            ],
            cwd=str(core.parent),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def wait(self) -> None:
        deadline = time.time() + 15
        while time.time() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError(f"core exited early with code {self.process.returncode}")
            try:
                with urllib.request.urlopen(self.base + "/api/version", timeout=1) as response:
                    if json.loads(response.read().decode())["version"] == "0.0.2":
                        return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("core did not become ready")

    def rpc(self, method: str, params: dict | None = None):
        payload = json.dumps({"id": 1, "method": method, "params": params or {}}).encode()
        request = urllib.request.Request(
            self.base + "/rpc",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode())
        if not data.get("ok"):
            raise RuntimeError(data.get("error", {}).get("message", "rpc failed"))
        return data["result"]

    def stop(self) -> None:
        try:
            urllib.request.urlopen(
                urllib.request.Request(self.base + "/app/quit", data=b"{}", method="POST"),
                timeout=3,
            ).read()
        except Exception:
            pass
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


def git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=ROOT / "core" / "build" / "gitcore.exe")
    parser.add_argument("--web", type=Path, default=ROOT / "app" / "out" / "renderer")
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()

    if not args.core.exists():
        raise SystemExit(f"core not found: {args.core}")
    if not (args.web / "index.html").exists():
        raise SystemExit(f"web build not found: {args.web}")

    work = ROOT / "core" / "build" / f"test-work-{os.getpid()}-{time.time_ns()}"
    work.mkdir(parents=True, exist_ok=True)
    repo = work / "repos" / "fixture"
    core = Core(args.core, args.web, work, instance=work.name)
    try:
        core.wait()
        check(True, "core HTTP started")

        info = core.rpc("system.info")
        check(info["version"] == "0.0.2", "system.version")
        check(info["git"]["installed"] is True, "git installed")

        config = core.rpc("config.get")["config"]
        check(isinstance(config["accounts"], list), "config accounts array")

        subprocess.run([sys.executable, str(FIXTURE), "--path", str(repo)], check=True)
        check((repo / ".git").exists(), "fixture repo created")

        account = {
            "id": "integration-account",
            "name": "集成测试账号",
            "githubUser": "integration-user",
            "gitName": "Integration User",
            "email": "integration@example.com",
            "httpsUser": "integration-user",
            "sshHost": "github.com",
            "sshKey": "",
            "defaultOwner": "fixture",
            "note": "integration test",
            "authType": "https",
            "isDefault": True,
        }
        saved = core.rpc("accounts.save", {"account": account, "makeDefault": True})
        check(any(item["id"] == account["id"] for item in saved["config"]["accounts"]), "account saved")
        check(any(item["id"] == account["id"] and item["isDefault"] for item in saved["config"]["accounts"]), "account default")

        scan = core.rpc("repos.scan", {"roots": [str(repo.parent)]})
        check(scan["count"] == 1, "scan finds fixture")

        info = core.rpc("repo.info", {"path": str(repo), "includeStatus": True})
        check(info["branch"] == "main", "repo branch")
        check(info["owner"] == "fixture", "repo owner")
        check(info["isGitHub"] is True, "repo GitHub")

        status = core.rpc("repo.status", {"path": str(repo)})
        check(status["branch"] == "main", "status branch")
        check(status["files"] == [], "status clean")

        hidden_file = repo / ".hidden-test"
        hidden_file.write_text("hidden", encoding="utf-8")
        subprocess.run(["attrib", "+h", str(hidden_file)], check=True)
        hidden_status = core.rpc("repo.status", {"path": str(repo)})
        check(
            any(item["path"] == ".hidden-test" and item.get("hidden") for item in hidden_status["files"]),
            "hidden file flagged",
        )
        hidden_file.unlink()

        branches = core.rpc("repo.branches", {"path": str(repo)})["branches"]
        local = [item for item in branches if item["type"] == "local"]
        check(len(local) >= 2, "local branches")

        stashes = core.rpc("repo.stashes", {"path": str(repo)})
        check(stashes["count"] >= 1, "stashes listed")

        history = core.rpc("repo.history", {"path": str(repo), "filter": "current", "limit": 2000})
        check(history["count"] == len(history["rows"]), "history nodes equal commits")
        check(all(row["lane"] >= 0 for row in history["rows"]), "history lanes assigned")
        check(len({row["hash"] for row in history["rows"]}) == len(history["rows"]), "history unique hashes")

        allHistory = core.rpc("repo.history", {"path": str(repo), "filter": "all", "limit": 2000})
        check(allHistory["count"] >= history["count"], "all history count")
        check(
            not any("index on" in row["subject"] for row in allHistory["rows"]),
            "all history excludes stash",
        )

        switched = core.rpc(
            "repo.switchAccount",
            {"path": str(repo), "accountId": account["id"], "protocol": "https"},
        )
        check(switched["url"] == "https://integration-user@github.com/fixture/fixture.git", "https url")
        check(git(repo, "config", "user.name") == "Integration User", "https user.name")
        check(git(repo, "config", "user.email") == "integration@example.com", "https user.email")

        core.rpc("repo.switchAccount", {"path": str(repo), "accountId": account["id"], "protocol": "ssh"})
        check(git(repo, "remote", "get-url", "origin") == "git@github.com:fixture/fixture.git", "ssh url")

        core.rpc("repo.branch.create", {"path": str(repo), "name": "integration-branch", "base": "main", "switch": True})
        check(git(repo, "branch", "--show-current") == "integration-branch", "branch create")
        core.rpc("repo.branch.switch", {"path": str(repo), "name": "main"})
        check(git(repo, "branch", "--show-current") == "main", "branch switch")
        core.rpc("repo.branch.delete", {"path": str(repo), "name": "integration-branch", "force": False})
        check("integration-branch" not in git(repo, "branch", "--list"), "branch delete")

        before = core.rpc("repo.history", {"path": str(repo), "filter": "all", "limit": 2000})["count"]
        readme = repo / "README.md"
        readme.write_text(readme.read_text(encoding="utf-8") + "\nintegration test\n", encoding="utf-8")
        core.rpc("repo.stage", {"path": str(repo), "paths": ["README.md"]})
        staged = core.rpc("repo.status", {"path": str(repo)})
        check(any(item["staged"] for item in staged["files"]), "stage file")
        core.rpc("repo.commit", {"path": str(repo), "message": "integration test commit"})
        after = core.rpc("repo.history", {"path": str(repo), "filter": "all", "limit": 2000})["count"]
        check(after == before + 1, "commit adds history node")

        with urllib.request.urlopen(core.base + "/", timeout=5) as response:
            html = response.read().decode()
        check("Git管理器" in html, "static index served")

        core.stop()
        check(core.process.poll() is not None, "core quit")
        print(f"\nALL CORE INTEGRATION TESTS PASSED ({passed})")
        return 0
    finally:
        try:
            core.stop()
        except Exception:
            pass
        if args.keep:
            print(f"kept: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"FAIL  {error}")
        raise SystemExit(1)
