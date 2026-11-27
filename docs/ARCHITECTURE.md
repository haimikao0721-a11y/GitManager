# 架构说明

## 总览

```text
┌──────────────────────────────────────────────────────────┐
│ Git管理器.exe (Win32 GUI 启动器, -mwindows)               │
│  设置 GIT_SWITCHER_V2_DATA 并无窗口拉起 gitcore.exe        │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│ Chrome / Edge --app 独立窗口                             │
│ React 18 + TypeScript + Tailwind                         │
│  fetch('/rpc', {method, params})                         │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTP, 127.0.0.1 only
┌───────────────────────────▼──────────────────────────────┐
│ gitcore.exe (C++17)                                      │
│  httplib 静态服务 + JSON-RPC 分发                         │
│   ├─ git.exe (CreateProcessW 参数数组，无 shell)          │
│   ├─ Windows 凭据管理器 (CredEnumerate/CredRead/Write)    │
│   ├─ WinHTTP (GitHub REST API)                           │
│   ├─ WinINet (系统代理刷新)                               │
│   └─ ssh-keygen / ssh / 原生文件对话框                    │
└──────────────────────────────────────────────────────────┘
```

Python 不参与运行时，仅用于构建组装、环境检查、配置迁移与集成测试。

## 核心模块

| 文件 | 职责 |
| --- | --- |
| `core/src/common.hpp` | UTF-8/UTF-16 转换、进程执行、Win32 文件读写、时间、随机 ID |
| `core/src/config.hpp/cpp` | 配置模型、可写数据目录探测、配置备份、默认账号 |
| `core/src/git.hpp/cpp` | URL 解析、账号匹配、Git 命令、仓库扫描、工作区状态/分支/Stash、历史 DAG |
| `core/src/platform.hpp/cpp` | Windows 凭据、Git/系统代理、SSH、GitHub API |
| `core/src/main.cpp` | RPC 分发、stdio 模式、HTTP 服务、浏览器拉起、单实例与心跳退出 |
| `core/src/launcher.cpp` | Win32 GUI 启动器（打包为 `dist/Git管理器.exe`） |
| `core/src/app.rc` | 内嵌 `assets/app.ico` 应用图标资源 |
| `core/src/httplib.h` | cpp-httplib 单头文件 HTTP 服务器 |
| `app/src/renderer/src/App.tsx` | 根布局、`Ctrl+1~4` / `Ctrl+K` 快捷键、页面调度 |
| `app/src/renderer/src/main.tsx` | 桌面化防护（屏蔽右键查看源码、DevTools 快捷键与元素拖拽） |
| `app/src/renderer/src/components/` | `Sidebar`、`TitleBar`、`CommandPalette`、`HistoryView`、`Toasts`、`ui` |
| `app/src/renderer/src/pages/` | `AccountsPage`、`ReposPage`、`WorkspacePage`、`SettingsPage` |
| `app/src/renderer/src/store/app.ts` | Zustand 全局状态、主题同步与 RPC 调用 |
| `app/src/renderer/src/lib/httpBridge.ts` | 将 `window.api` 映射到 HTTP 接口 |
| `tools/pipeline/build.py` | CMake + Vite 构建与组装 `dist/` |

## 主题与窗口外观

- 主题由 `data-theme` 驱动 CSS 变量：`dark`（深色炭黑）、`light`（浅色瓷白）、`sepia`（护眼暖纸）。
- 三套主题采用高对比黑白灰/纸墨配色体系（`--accent` 与 `--accent-fg` 随主题反色），避免高亮蓝色模板感。
- 切换主题时同步更新 `<meta name="theme-color">` 与 `document.documentElement.style.colorScheme`，使 Chrome/Edge `--app` 原生标题栏与页面顶栏无缝衔接。
- `assets/app.ico` 与 `app/src/renderer/public/favicon.ico` 采用 Windows 标准多帧 ICO（`16~128` 为 32 位 BGRA BMP 帧，`256` 为 PNG 帧），同时嵌入 `gitcore.exe` 与 `Git管理器.exe`。

## 进程与生命周期

1. 用户启动 `dist\Git管理器.exe`（或 `启动.ps1`）。
2. 启动器设置 `GIT_SWITCHER_V2_DATA=<root>\data`，以 `CREATE_NO_WINDOW` 启动 `gitcore.exe --serve --open --web-root <root>\web`。
3. `gitcore.exe` 通过命名互斥量 `Local\GitAccountSwitcherV2` 检查单实例；若已运行则读取 `data/runtime.json` 端口并拉起新窗口后退出。
4. 首次启动绑定 `127.0.0.1:17893`（占用则顺延），写入 `data/runtime.json`，并使用独立 `--user-data-dir=<data>\browser-profile` 启动 Chrome/Edge `--app` 窗口（`1460×940`）。
5. 页面每 5 秒发送 `POST /app/heartbeat`，窗口关闭且超过 90 秒无心跳时核心自动退出；点击退出按钮会触发 `POST /app/quit` 并通过 `CloseAppWindows()` 关闭匹配标题 `Git管理器` 的应用窗口。

## 配置与数据目录

`Config::DataDir()` 按顺序探测可写目录：

1. `GIT_SWITCHER_V2_DATA`
2. `%APPDATA%\GitAccountSwitcherV2`
3. `%LOCALAPPDATA%\GitAccountSwitcherV2`
4. 可执行文件同级 `data\`
5. `%USERPROFILE%\GitAccountSwitcherV2`
6. `%TEMP%\GitAccountSwitcherV2`

配置保存采用临时文件写入 + `MoveFileExW(MOVEFILE_REPLACE_EXISTING)` 原子替换，覆盖前将旧配置复制到 `backups/`。

## 工作区与提交历史 DAG

- **工作区合并视图**：工作区统一承载「变更」与「提交历史」两个子视图，并支持顶部下拉切换仓库。
- **分支节点时间线与签出**：单击左侧分支调用 `repo.history`（传 `branch.refName`）在分支右侧展开节点时间线；右键节点支持调用 `repo.checkout`（`git checkout <hash>`）直接签出到该历史状态，或基于该节点哈希创建分支。
- **历史 DAG 布局**：`GetRepoHistory` 使用 `git log --topo-order` 配合 `--` 分隔符提取提交与父关系，按活动泳道分配颜色与连线坐标（`lane`、`through`、`incoming`、`outgoing`），前端 `GraphCell` 使用 SVG 与虚拟滚动渲染。
- **真实提交总数**：通过 `git rev-list --count` 单独统计总数，`--max-count` 仅限制绘图节点数。

## 安全边界

- HTTP 服务仅监听 `127.0.0.1`，无外网暴露。
- 所有 Git / SSH 进程调用使用 `CreateProcessW` 参数数组，杜绝 shell 注入。
- Git 凭据页面在前端过滤仅显示 Git / 代码托管相关条目，默认遮挡敏感 Token。
- 破坏性操作均需二次确认，修改代理与全局配置前自动备份。
