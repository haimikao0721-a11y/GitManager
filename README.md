# Git管理器

面向 Windows 的轻量级 Git 多账号与仓库桌面管理工具（v2）：

- **C++17 核心**（`gitcore.exe`）：负责 Git 操作、仓库扫描、账户切换、代理、Git 凭据管理、SSH 配置与提交历史 DAG 布局。
- **原生 Win32 启动器**（`Git管理器.exe`）：无黑框静默拉起核心服务并打开独立应用窗口。
- **React + TypeScript + Tailwind 前端**：运行在 Chrome / Edge `--app` 独立窗口中，禁用浏览器右键菜单与源码查看快捷键，提供桌面级交互体验。
- **Python 管线**：负责构建打包、环境检查、旧版配置迁移与集成测试。

仓库地址：<https://github.com/haimikao0721-a11y/GitCore>

---

## 为什么采用 C++ 核心 + Chrome App 模式

相比 Electron 方案：

```text
Git管理器.exe (Win32 GUI 启动器)
        │
        ▼
gitcore.exe (C++17, 127.0.0.1 HTTP + JSON-RPC)
        ▲
        │ 同源 fetch('/rpc')
        ▼
React / TypeScript UI  ←  Chrome / Edge --app 独立窗口
```

- 无需捆绑 Chromium/Electron 运行时与 Node 原生插件，体积精简、启动快。
- 所有 Git 命令、凭据读取、注册表代理与文件操作均在 C++ 本地完成，不依赖 JS 拼接命令行。
- 独立窗口、无地址栏与标签页，窗口标题栏配色与多尺寸图标随主题同步。

---

## 核心功能

### 账户

- 横条列表管理多 GitHub / Git 账号，支持设置默认账号。
- 配置账号名称、GitHub 用户名、提交身份（`user.name` / `user.email`）、HTTPS 用户名、SSH Host、SSH Key 路径、默认 Owner 与备注。
- 支持 HTTPS 与 SSH 两种认证方式。

### 仓库

- 扫描指定目录中的 `.git`（自动跳过 `node_modules`、`build`、`dist`、`out`、`.pnpm-store`、`AppData` 等目录）。
- 支持按名称 / 路径 / Owner / 分支搜索，以及按账号筛选。
- **批量切换**：勾选多个仓库批量应用目标账号与协议，逐个返回执行结果。
- 支持一键直达工作区（变更 / 提交历史）、打开文件夹、终端或远程仓库主页。
- 支持新建 / 关联本地仓库，或通过 GitHub Token 直接创建远程仓库。

### 工作区（变更 + 提交历史）

- 顶部直接切换当前仓库，集成 **变更** 与 **提交历史** 两个视图，共用 `Fetch / 拉取 / 推送 / 刷新 / 编辑器 / 终端 / 文件夹` 工具栏。
- **分支与节点签出**：
  - 点击左侧分支可在右侧紧贴展开该分支的提交节点时间线，标出 `HEAD` 与分支/标签位置。
  - 右键任意节点可直接**签出到此节点**（`git checkout`）、**从此节点新建分支**或**复制提交哈希**；右键/双击分支可直接切换或删除分支。
- **工作区变更**：展示已暂存 / 未暂存 / 冲突 / 隐藏文件，支持单文件或全部暂存、取消暂存、丢弃修改、解决冲突（用我的 / 用对方的）、提交及提交后推送。
- **右侧面板**：就地切换当前仓库使用的账户与协议（附带 remote 地址预览），以及保存 / 应用 / 弹出 / 删除 Stash。
- **提交历史视图**：Fork 风格彩色分支泳道图、按当前分支 / 全部分支 / 指定分支筛选、虚拟滚动（支持大仓库）与提交详情面板（含右键节点签出）。

### 设置

- **三套主题**：深色（炭黑墨白）、浅色（瓷白墨黑）、护眼（暖纸深棕），侧边栏与设置页可随时切换，窗口原生标题栏同步配色。
- **基础配置**：提交历史绘图上限、默认编辑器/终端命令、破坏性操作前确认开关、扫描目录管理。
- **网络代理**：Git 全局代理（`http.proxy` / `https.proxy`）与 Windows 系统代理（修改前自动备份）。
- **Git 凭据与 GitHub 测试**：只过滤展示 Git / 代码托管相关凭据（隐藏无关 Windows 系统凭据），支持显示/隐藏、复制、添加、删除与一键清除 GitHub 凭据；Token 测试默认不落盘。
- **SSH Key**：生成 ed25519 密钥、写入 `~/.ssh/config` 多账号别名、测试 GitHub SSH 连接。
- **本机重置**：备份 `.gitconfig` 与 `.git-credentials` 后清除全局身份、GitHub 凭据与 Git 代理。

---

## 快速开始

### 环境要求

- Windows 10 / 11 x64
- Git for Windows（`git.exe` 在 `PATH` 中）
- Chrome 或 Edge（用于应用窗口）
- 从源码构建需要：CMake、Ninja、MinGW `g++` / `windres`、Node.js、pnpm、Python 3

检查构建环境：

```powershell
python tools\pipeline\check_environment.py
```

### 一键构建与打包

```powershell
# 构建绿色版 dist/
python tools\pipeline\build.py

# 构建并输出用于 GitHub Release 的纯净压缩包（自动排除本机 data/）
python tools\pipeline\build.py --package
```

构建脚本会依次执行：

1. 使用 CMake + Ninja + MinGW 编译 `core/build/gitcore.exe` 与 `core/build/launcher.exe`（内嵌 `assets/app.ico`）。
2. 运行 `gitcore.exe --selftest` 自检。
3. 在 `app/` 下执行 `pnpm install`、`pnpm typecheck` 与 `pnpm build`。
4. 运行 `tools/pipeline/test_core.py` 集成测试。
5. 组装 `dist/` 便携目录（输出 `Git管理器.exe`、`gitcore.exe`、`web/`、`assets/`、`docs/`、`启动.ps1`，并保留已有的 `dist/data/`）。
6. 传入 `--package` 时额外生成 `release/GitCore-v<VERSION>-win-x64.zip` 发布包。

### 运行

- **便携版（推荐）**：直接双击 `dist\Git管理器.exe`。
- **脚本方式**：运行根目录或 `dist\` 下的 `启动.ps1`。
- **创建桌面快捷方式**：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\pipeline\create_shortcut.ps1 -Root "$PWD\dist"
```

### 开发调试

```powershell
# 终端 1：启动核心
core\build\gitcore.exe --serve --no-open --web-root app\out\renderer

# 终端 2：启动 Vite 热更新开发服务器（已代理 /rpc、/app、/dialog、/api 到 17893）
cd app
pnpm dev
```

---

## 项目结构

```text
GitCore/
  assets/
    app.ico                 Windows 多尺寸应用图标（16~128 BMP + 256 PNG）
  core/                     C++17 核心与启动器
    src/
      common.hpp            UTF-8/UTF-16、Win32 进程与文件辅助
      config.*              配置读写、数据目录探测与备份
      git.*                 Git 命令封装、仓库扫描、历史 DAG 布局
      platform.*            凭据管理、代理、SSH、GitHub WinHTTP API
      main.cpp              JSON-RPC 分发、HTTP 服务、浏览器拉起与生命周期
      launcher.cpp          Win32 GUI 静默启动器（生成 Git管理器.exe）
      app.rc                Windows 可执行文件图标资源
      httplib.h             单头文件 HTTP 服务器
    tests/
  app/                      React 18 + TypeScript + Tailwind 前端
    src/renderer/
      index.html            页面入口、CSP、多尺寸 Favicon 与 theme-color
      public/               静态图标与 manifest.json
      src/pages/            AccountsPage / ReposPage / WorkspacePage / SettingsPage
      src/components/       Sidebar / TitleBar / CommandPalette / HistoryView / Toasts / ui
      src/store/            Zustand 状态与 RPC 调用封装
      src/lib/              HTTP bridge 与工具函数
  docs/
    ARCHITECTURE.md         架构与实现细节
    PROTOCOL.md             HTTP JSON-RPC 协议文档
  tools/pipeline/           构建、测试与迁移脚本
  dist/                     打包输出目录（不纳入 Git 版本控制）
  release/                  发布压缩包目录（不纳入 Git 版本控制）
  启动.ps1                  备用 PowerShell 启动脚本
```

---

## 数据目录与安全边界

- 便携版默认通过 `GIT_SWITCHER_V2_DATA` 将数据集中在 `dist\data\`（含 `config.json`、`runtime.json`、`browser-profile/`、`backups/`、`logs/`）。
- HTTP 服务仅绑定 `127.0.0.1` 回环地址，不对外开放。
- 所有 Git 命令均通过 `CreateProcessW` 参数数组传递，不经过 shell 拼接。
- 代理、Git 全局配置与 SSH 配置修改前自动备份；拉取默认使用 `--ff-only`。
- 旧版配置迁移：`python tools\pipeline\migrate_config.py --data-dir "dist\data"`。

## 版本

`0.0.1`
