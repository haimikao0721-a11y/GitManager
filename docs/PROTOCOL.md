# 核心协议（HTTP JSON-RPC）

核心默认只监听 `127.0.0.1`，由同一个进程提供静态 UI 和 API。

## RPC

```http
POST /rpc
Content-Type: application/json

{"id":1,"method":"system.info","params":{}}
```

成功：

```json
{"id":1,"ok":true,"result":{}}
```

失败：

```json
{"id":1,"ok":false,"error":{"code":"error","message":"..."}}
```

## 系统 / 配置

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `system.info` | – | 版本、配置路径、数据目录、Git 信息、平台 |
| `system.git` | – | Git 安装状态、版本、路径 |
| `system.clearBinding` | – | 清理 GitHub 凭据、`.git-credentials`、全局身份、Git 代理，返回结果列表 |
| `config.get` | – | `{config, path, dataDir}` |
| `config.save` | `{config}` | 保存后的配置 |

## 账号

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `accounts.save` | `{account, makeDefault}` | `{account, config}` |
| `accounts.delete` | `{id}` | `{config}` |
| `accounts.setDefault` | `{id}` | `{config}` |

配置 `settings.theme` 取值：`dark`（深色）、`light`（浅色）、`sepia`（护眼暖纸）。

账号字段：

```json
{
  "id": "hex",
  "name": "主账号（MiKaoHai）",
  "githubUser": "haimikao0721-a11y",
  "gitName": "MiKaoHai",
  "email": "...",
  "httpsUser": "...",
  "sshHost": "github.com",
  "sshKey": "",
  "defaultOwner": "...",
  "note": "",
  "authType": "https",
  "isDefault": true
}
```

## 仓库读取

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `repos.scan` | `{roots?}` | `{repos, count, roots}` |
| `repo.info` | `{path, includeStatus?}` | 仓库摘要 |
| `repo.status` | `{path}` | `{branch, upstream, ahead, behind, files, hasConflicts}`；每个文件含 `hidden` |
| `repo.branches` | `{path}` | `{branches, current, upstream}` |
| `repo.stashes` | `{path}` | `{stashes, count}` |
| `repo.history` | `{path, filter, limit}` | `{rows, count, shown, filterLabel, current, upstream, limit}` |
| `repo.remotes` | `{path}` | `{remotes}` |

### 历史行

```json
{
  "hash": "8f087b1",
  "parents": ["08c0388", "1aeea16"],
  "date": "2026-10-24",
  "author": "MiKaoHai",
  "decorations": "HEAD -> main, tag: v0.1.0, origin/main",
  "subject": "合并 release/v0.1.0-clean",
  "lane": 0,
  "color": 0,
  "nodeFromTop": false,
  "nodeToBottom": true,
  "through": [],
  "incoming": [],
  "outgoing": [{"lane": 1, "color": 1}],
  "maxLane": 1
}
```

## 仓库操作

| 方法 | 参数 |
| --- | --- |
| `repo.switchAccount` | `{path, accountId, protocol}` |
| `repo.fetch` | `{path}` |
| `repo.pull` | `{path}` |
| `repo.push` | `{path}` |
| `repo.stage` | `{path, paths[]}` |
| `repo.unstage` | `{path, paths[]}` |
| `repo.discard` | `{path, files:[{path, untracked}]}` |
| `repo.commit` | `{path, message, amend?}` |
| `repo.stash.push` | `{path, message, includeUntracked}` |
| `repo.stash.apply/pop/drop` | `{path, index}` |
| `repo.branch.create` | `{path, name, base, switch}` |
| `repo.branch.switch` | `{path, name}` |
| `repo.branch.delete` | `{path, name, force}` |
| `repo.checkout` | `{path, target}` |
| `repo.conflict.resolve` | `{path, file, side: "ours"\\|"theirs"}` |
| `repo.init` | `{path, remoteUrl}` |

## 代理

| 方法 | 参数 |
| --- | --- |
| `proxy.git.get` | – |
| `proxy.git.set` | `{url}` |
| `proxy.git.clear` | – |
| `proxy.system.get` | – |
| `proxy.system.set` | `{server}` |
| `proxy.system.clear` | – |

## Git 凭据（Windows 凭据管理器）

| 方法 | 参数 |
| --- | --- |
| `credentials.list` | – |
| `credentials.get` | `{target}` |
| `credentials.delete` | `{target}` |
| `credentials.clearGithub` | – |
| `credentials.store` | `{target, userName, secret, localMachine?}` |

## SSH

| 方法 | 参数 |
| --- | --- |
| `ssh.list` | – |
| `ssh.generate` | `{keyPath, comment, overwrite}` |
| `ssh.config.upsert` | `{host, hostName, user, identityFile}` |
| `ssh.test` | `{host}` |

## GitHub

| 方法 | 参数 |
| --- | --- |
| `github.test` | `{token}` |
| `github.listRepos` | `{token}` |
| `github.createRepo` | `{token, name, private, description, autoInit}` |

## 应用辅助接口

| 接口 | 说明 |
| --- | --- |
| `POST /dialog/folder` | 原生选择文件夹，返回 `{path}` |
| `POST /dialog/file` | 原生选择文件，返回 `{path}` |
| `POST /app/openPath` | `{target}` |
| `POST /app/openExternal` | `{url}` |
| `POST /app/showInFolder` | `{target}` |
| `POST /app/openTerminal` | `{target}` |
| `POST /app/openEditor` | `{target, editor}` |
| `POST /app/heartbeat` | 页面心跳 |
| `POST /app/quit` | 停止核心并关闭窗口 |
| `GET /api/version` | 版本 |
| `GET /static` | `web/` 下的静态文件 |
