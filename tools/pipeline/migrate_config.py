#!/usr/bin/env python3
"""Migrate the old PowerShell app's accounts.json to the v2 config format."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OLD = Path.home() / "Desktop" / "Git账户切换器" / "config" / "accounts.json"


def default_data_dir() -> Path:
    candidates = [
        ROOT / "core" / "build" / "data",
        ROOT / "dist" / "data",
        Path.home() / "AppData" / "Roaming" / "GitAccountSwitcherV2",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def global_git_name() -> str:
    try:
        return subprocess.check_output(
            ["git", "config", "--global", "--get", "user.name"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""


def map_account(account: dict, is_default: bool, fallback_git_name: str = "") -> dict:
    github_user = str(account.get("githubUser") or "").strip()
    ssh_key = str(account.get("sshKey") or "").strip()
    return {
        "id": str(account.get("id") or uuid.uuid4().hex),
        "name": str(account.get("name") or (f"主账号（{github_user}）" if github_user else "主账号")),
        "githubUser": github_user,
        "gitName": str(account.get("gitName") or fallback_git_name or ""),
        "email": str(account.get("email") or ""),
        "httpsUser": str(account.get("httpsUser") or github_user),
        "sshHost": str(account.get("sshHost") or "github.com"),
        "sshKey": ssh_key,
        "defaultOwner": str(account.get("defaultOwner") or github_user),
        "note": str(account.get("note") or "从旧版 Git 账户切换器迁移"),
        "authType": "ssh" if ssh_key else "https",
        "isDefault": is_default,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--old", type=Path, default=DEFAULT_OLD, help="old accounts.json")
    parser.add_argument("--data-dir", type=Path, default=None, help="v2 data directory")
    args = parser.parse_args()

    old_path = args.old
    if not old_path.exists():
        raise SystemExit(f"Old config not found: {old_path}")
    old = load_json(old_path)
    data_dir = args.data_dir or default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    target = data_dir / "config.json"

    existing = {}
    if target.exists():
        try:
            existing = load_json(target)
        except Exception:
            existing = {}
        backup_dir = data_dir / "backups"
        backup_dir.mkdir(exist_ok=True)
        shutil.copy2(target, backup_dir / f"config-{time.strftime('%Y%m%d-%H%M%S')}.json")

    accounts = list(existing.get("accounts") or [])
    by_user = {str(item.get("githubUser") or "").lower(): index for index, item in enumerate(accounts)}
    old_accounts = old.get("accounts") or []
    fallback_git_name = global_git_name()
    for index, item in enumerate(old_accounts):
        mapped = map_account(item, is_default=(index == 0 and not accounts), fallback_git_name=fallback_git_name)
        key = mapped["githubUser"].lower()
        if key and key in by_user:
            current = accounts[by_user[key]]
            current.update({k: v for k, v in mapped.items() if v not in ("", None, False) or k == "isDefault"})
        else:
            accounts.append(mapped)
            if key:
                by_user[key] = len(accounts) - 1

    if accounts and not any(bool(item.get("isDefault")) for item in accounts):
        accounts[0]["isDefault"] = True

    scan_roots = list(existing.get("scanRoots") or [])
    for root in old.get("scanRoots") or []:
        if root and root not in scan_roots:
            scan_roots.append(root)
    if not scan_roots:
        scan_roots = [str(Path.home() / "Desktop")]

    existing_settings = existing.get("settings") or {}
    settings = {
        "theme": "dark",
        "confirmDestructive": True,
        "editor": "code",
        "terminal": "wt",
        "historyLimit": 2000,
    }
    if existing_settings.get("theme") in {"dark", "light", "sepia"}:
        settings["theme"] = existing_settings["theme"]
    for key in ("confirmDestructive", "editor", "terminal", "historyLimit"):
        if key in existing_settings:
            settings[key] = existing_settings[key]

    config = {
        "version": 2,
        "scanRoots": scan_roots,
        "accounts": accounts,
        "settings": settings,
    }
    target.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Migrated {len(old_accounts)} account(s) to {target}")
    print(f"Accounts: {len(accounts)}, scan roots: {len(scan_roots)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
