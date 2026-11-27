#!/usr/bin/env python3
"""Small GitHub REST helper used by the build/migration pipeline.

The desktop app talks to GitHub directly from C++; this script is for CI,
manual checks, and automation outside the app. Uses only the standard library.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
HEADERS = {
    "User-Agent": "GitAccountSwitcherV2-Pipeline/2.0",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def request(method: str, path: str, token: str, body: dict | None = None) -> dict | list:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"GitHub API {error.code}: {detail}") from error


def simplify(repo: dict) -> dict:
    return {
        "id": repo.get("id"),
        "name": repo.get("name"),
        "fullName": repo.get("full_name"),
        "private": repo.get("private"),
        "description": repo.get("description"),
        "cloneUrl": repo.get("clone_url"),
        "sshUrl": repo.get("ssh_url"),
        "defaultBranch": repo.get("default_branch"),
        "updatedAt": repo.get("updated_at"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    test = sub.add_parser("test", help="show the authenticated user")
    test.add_argument("--token", required=True)

    repos = sub.add_parser("list", help="list repositories")
    repos.add_argument("--token", required=True)

    create = sub.add_parser("create", help="create a repository")
    create.add_argument("--token", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--description", default="")
    create.add_argument("--public", action="store_true")
    create.add_argument("--auto-init", action="store_true")

    args = parser.parse_args()
    if args.command == "test":
        user = request("GET", "/user", args.token)
        print(json.dumps({k: user.get(k) for k in ("login", "name", "id", "html_url")}, indent=2))
    elif args.command == "list":
        data = request("GET", "/user/repos?per_page=100&sort=updated", args.token)
        print(json.dumps([simplify(item) for item in data], ensure_ascii=False, indent=2))
    elif args.command == "create":
        repo = request(
            "POST",
            "/user/repos",
            args.token,
            {
                "name": args.name,
                "private": not args.public,
                "description": args.description,
                "auto_init": args.auto_init,
            },
        )
        print(json.dumps(simplify(repo), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
