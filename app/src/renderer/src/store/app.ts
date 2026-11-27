import { create } from 'zustand'
import type {
  Account,
  AppConfig,
  Branch,
  Credential,
  GitHubRepo,
  GitHubUser,
  GitProxyState,
  HistoryResult,
  InspectorFocus,
  InspectorTab,
  PageId,
  RepoInfo,
  RepoStatus,
  RepoLockStatus,
  Settings,
  SshInfo,
  Stash,
  StashesResult,
  SystemInfo,
  SystemProxyState,
  Theme,
  ToastItem,
  WorkspaceTab
} from '@/types/api'

type LoadingKey =
  | 'bootstrap'
  | 'scan'
  | 'repo'
  | 'history'
  | 'mutation'
  | 'credentials'
  | 'ssh'
  | 'proxies'
  | 'github'

function call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return window.api.invoke<T>(method, params)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

const THEME_CHROME_COLORS: Record<Theme, { color: string; scheme: 'dark' | 'light' }> = {
  dark: { color: '#14161a', scheme: 'dark' },
  light: { color: '#fbfbfc', scheme: 'light' },
  sepia: { color: '#ebe4d5', scheme: 'light' }
}

function applyTheme(theme: Theme): void {
  const { color, scheme } = THEME_CHROME_COLORS[theme] ?? THEME_CHROME_COLORS.dark
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.classList.remove('sepia')
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = scheme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', color)
  window.api.setTheme(theme)
}

interface PendingMutation {
  method: string
  params: Record<string, unknown>
  successTitle: string
  options: { history?: boolean; refreshInfo?: boolean }
  path: string
}

interface AppState {
  config: AppConfig | null
  system: SystemInfo | null
  version: string
  repos: RepoInfo[]
  selectedRepoPath: string
  activePage: PageId
  sidebarCollapsed: boolean
  workspaceTab: WorkspaceTab
  historyFilter: string
  inspectorOpen: boolean
  inspectorFocus: InspectorFocus
  inspectorTab: InspectorTab
  inspectorWidth: number
  selectedCommitHash: string
  selectedCommitFile: string
  selectedWorkFile: { path: string; mode: 'unstaged' | 'staged' } | null
  status: RepoStatus | null
  branches: Branch[]
  history: HistoryResult | null
  stashes: Stash[]
  lockIssue: RepoLockStatus | null
  pendingMutation: PendingMutation | null
  credentials: Credential[]
  ssh: SshInfo | null
  gitProxy: GitProxyState
  systemProxy: SystemProxyState
  loading: Partial<Record<LoadingKey, boolean>>
  toasts: ToastItem[]
  paletteOpen: boolean
  bootError: string

  bootstrap: () => Promise<void>
  setActivePage: (page: PageId) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setWorkspaceTab: (tab: WorkspaceTab) => void
  setInspectorOpen: (open: boolean) => void
  toggleInspector: () => void
  setInspectorFocus: (focus: InspectorFocus) => void
  setInspectorTab: (tab: InspectorTab) => void
  setInspectorWidth: (width: number) => void
  setSelectedCommitHash: (hash: string) => void
  setSelectedCommitFile: (file: string) => void
  setSelectedWorkFile: (file: { path: string; mode: 'unstaged' | 'staged' } | null) => void
  setPaletteOpen: (open: boolean) => void
  toast: (kind: ToastItem['kind'], title: string, description?: string) => void
  dismissToast: (id: number) => void

  refreshConfig: () => Promise<void>
  saveAccount: (account: Account, makeDefault: boolean) => Promise<boolean>
  deleteAccount: (id: string) => Promise<void>
  setDefaultAccount: (id: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  updateScanRoots: (roots: string[]) => Promise<void>

  scanRepos: (roots?: string[]) => Promise<void>
  selectRepo: (path: string) => Promise<void>
  refreshRepo: (options?: { history?: boolean }) => Promise<void>
  refreshHistory: (filter?: string) => Promise<void>
  refreshReposLight: () => Promise<void>
  clearLockAndRetry: () => Promise<void>
  dismissLock: () => void

  switchAccount: (accountId: string, protocol: 'https' | 'ssh') => Promise<boolean>
  switchAccounts: (
    paths: string[],
    accountId: string,
    protocol: 'https' | 'ssh'
  ) => Promise<{ success: number; failed: number }>
  fetchRepo: () => Promise<void>
  pullRepo: () => Promise<void>
  pushRepo: () => Promise<void>
  stageFiles: (paths?: string[]) => Promise<void>
  unstageFiles: (paths?: string[]) => Promise<void>
  discardFiles: (files: Array<{ path: string; untracked: boolean }>) => Promise<void>
  commit: (message: string, amend?: boolean) => Promise<boolean>
  stashPush: (message: string, includeUntracked: boolean) => Promise<void>
  stashAction: (action: 'apply' | 'pop' | 'drop', index: number) => Promise<void>
  createBranch: (name: string, base: string, switchTo: boolean) => Promise<boolean>
  switchBranch: (name: string) => Promise<boolean>
  deleteBranch: (name: string, force: boolean) => Promise<boolean>
  checkoutTarget: (target: string) => Promise<boolean>
  resolveConflict: (file: string, side: 'ours' | 'theirs') => Promise<void>
  initRepo: (path: string, remoteUrl: string) => Promise<boolean>

  loadCredentials: () => Promise<void>
  revealCredential: (target: string) => Promise<void>
  deleteCredential: (target: string) => Promise<void>
  clearGithubCredentials: () => Promise<void>
  clearBinding: () => Promise<void>
  storeCredential: (target: string, userName: string, secret: string) => Promise<void>

  loadProxies: () => Promise<void>
  setGitProxy: (url: string) => Promise<void>
  clearGitProxy: () => Promise<void>
  setSystemProxy: (server: string) => Promise<void>
  clearSystemProxy: () => Promise<void>

  loadSsh: () => Promise<void>
  generateSshKey: (
    keyPath: string,
    comment: string,
    overwrite: boolean
  ) => Promise<{ publicKey: string; publicPath: string } | null>
  saveSshConfig: (
    host: string,
    hostName: string,
    user: string,
    identityFile: string
  ) => Promise<boolean>
  testSsh: (host: string) => Promise<{ success: boolean; output: string } | null>

  testGithub: (token: string) => Promise<GitHubUser | null>
  listGithubRepos: (token: string) => Promise<GitHubRepo[]>
  createGithubRepo: (params: {
    token: string
    name: string
    private: boolean
    description: string
    autoInit: boolean
  }) => Promise<GitHubRepo | null>
}

let toastId = 1

export const useAppStore = create<AppState>()((set, get) => {
  const setLoading = (key: LoadingKey, value: boolean): void => {
    set((state) => ({ loading: { ...state.loading, [key]: value } }))
  }

  const fail = (error: unknown, title = '操作失败'): void => {
    get().toast('error', title, errorMessage(error))
  }

  const replaceRepo = (repo: RepoInfo): void => {
    set((state) => ({
      repos: state.repos.map((item) => (item.path === repo.path ? repo : item))
    }))
  }

  const requireRepo = (): string | null => {
    const path = get().selectedRepoPath
    if (!path) {
      get().toast('info', '先选择一个仓库')
      return null
    }
    return path
  }

  const refreshSelectedInfo = async (): Promise<void> => {
    const path = get().selectedRepoPath
    if (!path) return
    try {
      const info = await call<RepoInfo>('repo.info', { path, includeStatus: true })
      replaceRepo(info)
    } catch {
      // A missing repo should not break the rest of the UI.
    }
  }

  const runRepoMutation = async (
    method: string,
    params: Record<string, unknown>,
    successTitle: string,
    options: { history?: boolean; refreshInfo?: boolean } = {}
  ): Promise<boolean> => {
    const path = requireRepo()
    if (!path) return false
    if (get().loading.mutation) {
      get().toast('info', '上一个 Git 操作还在进行，请稍候')
      return false
    }
    setLoading('mutation', true)
    try {
      await call(method, { path, ...params })
      if (get().selectedRepoPath !== path) return false
      get().toast('success', successTitle)
      await get().refreshRepo({ history: options.history })
      if (options.refreshInfo !== false) await refreshSelectedInfo()
      return true
    } catch (error) {
      const message = errorMessage(error)
      if (message.toLowerCase().includes('index.lock')) {
        try {
          const lock = await call<RepoLockStatus>('repo.lockStatus', { path })
          if (lock.exists || !lock.writable) {
            set({
              lockIssue: lock,
              pendingMutation: { method, params, successTitle, options, path }
            })
          }
        } catch {
          // Keep the original Git error if lock diagnostics fail.
        }
      }
      fail(error, successTitle + '失败')
      return false
    } finally {
      setLoading('mutation', false)
    }
  }

  return {
    config: null,
    system: null,
    version: '0.0.2',
    repos: [],
    selectedRepoPath: '',
    activePage: 'repos',
    sidebarCollapsed: false,
    workspaceTab: 'changes',
    historyFilter: 'all',
    inspectorOpen: true,
    inspectorFocus: 'commit',
    inspectorTab: 'commit',
    inspectorWidth: 380,
    selectedCommitHash: '',
    selectedCommitFile: '',
    selectedWorkFile: null,
    status: null,
    branches: [],
    history: null,
    stashes: [],
    lockIssue: null,
    pendingMutation: null,
    credentials: [],
    ssh: null,
    gitProxy: { http: '', https: '' },
    systemProxy: { enabled: false, server: '', autoConfig: '', rawEnabled: 0 },
    loading: {},
    toasts: [],
    paletteOpen: false,
    bootError: '',

    toast: (kind, title, description) => {
      const id = toastId++
      set((state) => ({ toasts: [...state.toasts, { id, kind, title, description }] }))
      setTimeout(() => get().dismissToast(id), 5200)
    },

    dismissToast: (id) => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    },

    bootstrap: async () => {
      setLoading('bootstrap', true)
      try {
        const [system, configPayload, version] = await Promise.all([
          call<SystemInfo>('system.info'),
          call<{ config: AppConfig }>('config.get'),
          window.api.getVersion()
        ])
        set({
          system,
          config: configPayload.config,
          version,
          bootError: ''
        })
        applyTheme(configPayload.config.settings.theme)
        const first = get().repos[0]
        if (!get().selectedRepoPath && first) set({ selectedRepoPath: first.path })
      } catch (error) {
        set({ bootError: errorMessage(error) })
        fail(error, '初始化失败')
      } finally {
        setLoading('bootstrap', false)
      }
    },

    setActivePage: (page) => set({ activePage: page }),
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setWorkspaceTab: (tab) =>
      set({
        workspaceTab: tab,
        inspectorFocus: tab === 'changes' ? 'working' : 'commit'
      }),
    setInspectorOpen: (open) => set({ inspectorOpen: open }),
    toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
    setInspectorFocus: (focus) => set({ inspectorFocus: focus }),
    setInspectorTab: (tab) => set({ inspectorTab: tab }),
    setInspectorWidth: (width) =>
      set({ inspectorWidth: Math.max(300, Math.min(720, Math.round(width))) }),
    setSelectedCommitHash: (hash) => set({ selectedCommitHash: hash, selectedCommitFile: '' }),
    setSelectedCommitFile: (file) => set({ selectedCommitFile: file }),
    setSelectedWorkFile: (file) => set({ selectedWorkFile: file }),
    setPaletteOpen: (open) => set({ paletteOpen: open }),

    refreshConfig: async () => {
      try {
        const payload = await call<{ config: AppConfig }>('config.get')
        set({ config: payload.config })
        applyTheme(payload.config.settings.theme)
      } catch (error) {
        fail(error, '读取配置失败')
      }
    },

    saveAccount: async (account, makeDefault) => {
      try {
        const payload = await call<{ config: AppConfig; account: Account }>('accounts.save', {
          account,
          makeDefault
        })
        set({ config: payload.config })
        get().toast('success', account.id ? '账号已更新' : '账号已创建')
        return true
      } catch (error) {
        fail(error, '保存账号失败')
        return false
      }
    },

    deleteAccount: async (id) => {
      try {
        const payload = await call<{ config: AppConfig }>('accounts.delete', { id })
        set({ config: payload.config })
        get().toast('success', '账号已删除')
      } catch (error) {
        fail(error, '删除账号失败')
      }
    },

    setDefaultAccount: async (id) => {
      try {
        const payload = await call<{ config: AppConfig }>('accounts.setDefault', { id })
        set({ config: payload.config })
        get().toast('success', '默认账号已切换')
      } catch (error) {
        fail(error, '设置默认账号失败')
      }
    },

    updateSettings: async (patch) => {
      const config = get().config
      if (!config) return
      const next: AppConfig = {
        ...config,
        settings: { ...config.settings, ...patch }
      }
      set({ config: next })
      if (patch.theme) applyTheme(patch.theme)
      try {
        const payload = await call<{ config: AppConfig }>('config.save', { config: next })
        set({ config: payload.config })
      } catch (error) {
        fail(error, '保存设置失败')
      }
    },

    updateScanRoots: async (roots) => {
      const config = get().config
      if (!config) return
      const next: AppConfig = { ...config, scanRoots: roots }
      set({ config: next })
      try {
        const payload = await call<{ config: AppConfig }>('config.save', { config: next })
        set({ config: payload.config })
        await get().scanRepos(roots)
      } catch (error) {
        fail(error, '保存扫描目录失败')
      }
    },

    scanRepos: async (roots) => {
      setLoading('scan', true)
      try {
        const result = await call<{ repos: RepoInfo[]; count: number; roots: string[] }>(
          'repos.scan',
          roots ? { roots } : {}
        )
        set((state) => {
          const current = state.selectedRepoPath
          const exists = result.repos.some((repo) => repo.path === current)
          return {
            repos: result.repos,
            selectedRepoPath: exists ? current : result.repos[0]?.path ?? ''
          }
        })
        get().toast('success', `扫描完成，找到 ${result.count} 个仓库`)
      } catch (error) {
        fail(error, '扫描仓库失败')
      } finally {
        setLoading('scan', false)
      }
    },

    selectRepo: async (path) => {
      if (get().selectedRepoPath === path && get().status) return
      set({
        selectedRepoPath: path,
        historyFilter: 'all',
        selectedCommitHash: '',
        selectedCommitFile: '',
        selectedWorkFile: null,
        status: null,
        branches: [],
        stashes: [],
        history: null,
        lockIssue: null,
        pendingMutation: null
      })
      await get().refreshRepo({
        history: get().activePage === 'workspace'
      })
    },

    refreshRepo: async (options = {}) => {
      const path = get().selectedRepoPath
      if (!path) return
      setLoading('repo', true)
      try {
        const [status, branchesResult, stashesResult] = await Promise.all([
          call<RepoStatus>('repo.status', { path }),
          call<{ branches: Branch[] }>('repo.branches', { path }),
          call<StashesResult>('repo.stashes', { path })
        ])
        if (get().selectedRepoPath !== path) return
        set({
          status,
          branches: branchesResult.branches,
          stashes: stashesResult.stashes
        })
        if (options.history) await get().refreshHistory()
      } catch (error) {
        if (get().selectedRepoPath === path) fail(error, '读取仓库状态失败')
      } finally {
        if (get().selectedRepoPath === path) setLoading('repo', false)
      }
    },

    refreshHistory: async (filter) => {
      const path = get().selectedRepoPath
      if (!path) return
      const nextFilter = filter ?? get().historyFilter
      set({ historyFilter: nextFilter })
      setLoading('history', true)
      try {
        const limit = get().config?.settings.historyLimit ?? 2000
        const history = await call<HistoryResult>('repo.history', {
          path,
          filter: nextFilter,
          limit
        })
        if (get().selectedRepoPath !== path) return
        set({
          history,
          historyFilter:
            nextFilter === 'current' && !history.current ? 'all' : nextFilter
        })
      } catch (error) {
        if (get().selectedRepoPath === path) fail(error, '读取提交历史失败')
      } finally {
        if (get().selectedRepoPath === path) setLoading('history', false)
      }
    },

    refreshReposLight: async () => {
      await refreshSelectedInfo()
    },

    clearLockAndRetry: async () => {
      const pending = get().pendingMutation
      if (!pending) return
      setLoading('mutation', true)
      try {
        await call('repo.clearLock', { path: pending.path, force: true })
        set({ lockIssue: null, pendingMutation: null })
        await call(pending.method, { path: pending.path, ...pending.params })
        get().toast('success', pending.successTitle)
        await get().refreshRepo({ history: pending.options.history })
        if (pending.options.refreshInfo !== false) await refreshSelectedInfo()
      } catch (error) {
        fail(error, '清理锁后重试失败')
        try {
          const lock = await call<RepoLockStatus>('repo.lockStatus', { path: pending.path })
          if (lock.exists || !lock.writable) {
            set({ lockIssue: lock, pendingMutation: pending })
          }
        } catch {
          // Keep the retry error.
        }
      } finally {
        setLoading('mutation', false)
      }
    },

    dismissLock: () => set({ lockIssue: null, pendingMutation: null }),

    switchAccount: async (accountId, protocol) => {
      const path = requireRepo()
      if (!path) return false
      setLoading('mutation', true)
      try {
        await call('repo.switchAccount', { path, accountId, protocol })
        get().toast('success', '账户已切换')
        await refreshSelectedInfo()
        await get().refreshRepo()
        return true
      } catch (error) {
        fail(error, '切换账户失败')
        return false
      } finally {
        setLoading('mutation', false)
      }
    },

    switchAccounts: async (paths, accountId, protocol) => {
      if (paths.length === 0) {
        get().toast('info', '先选择要切换的仓库')
        return { success: 0, failed: 0 }
      }
      setLoading('mutation', true)
      let success = 0
      const failures: string[] = []
      for (const path of paths) {
        try {
          await call('repo.switchAccount', { path, accountId, protocol })
          success++
        } catch (error) {
          const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path
          failures.push(`${name}: ${errorMessage(error)}`)
        }
      }
      if (success > 0) {
        get().toast('success', `已切换 ${success} 个仓库的账户`)
      }
      if (failures.length > 0) {
        get().toast('error', `${failures.length} 个仓库切换失败`, failures.join('\n'))
      }
      if (paths.includes(get().selectedRepoPath)) {
        await refreshSelectedInfo()
        await get().refreshRepo()
      }
      setLoading('mutation', false)
      return { success, failed: failures.length }
    },

    fetchRepo: async () => {
      const path = requireRepo()
      if (!path) return
      setLoading('mutation', true)
      try {
        await call('repo.fetch', { path })
        get().toast('success', '远程分支已更新')
        await get().refreshRepo()
        if (get().activePage === 'workspace') {
          await get().refreshHistory()
        }
      } catch (error) {
        fail(error, '获取远程失败')
      } finally {
        setLoading('mutation', false)
      }
    },

    pullRepo: async () => {
      await runRepoMutation('repo.pull', {}, '拉取完成', { history: true })
    },

    pushRepo: async () => {
      await runRepoMutation('repo.push', {}, '推送完成', {
        history: get().activePage === 'workspace'
      })
    },

    stageFiles: async (paths) => {
      await runRepoMutation('repo.stage', { paths: paths ?? [] }, '已暂存')
    },

    unstageFiles: async (paths) => {
      await runRepoMutation('repo.unstage', { paths: paths ?? [] }, '已取消暂存')
    },

    discardFiles: async (files) => {
      await runRepoMutation('repo.discard', { files }, '已丢弃修改')
    },

    commit: async (message, amend = false) => {
      return runRepoMutation('repo.commit', { message, amend }, '提交成功', {
        history: get().activePage === 'workspace'
      })
    },

    stashPush: async (message, includeUntracked) => {
      await runRepoMutation('repo.stash.push', { message, includeUntracked }, '已保存 Stash')
    },

    stashAction: async (action, index) => {
      await runRepoMutation(`repo.stash.${action}`, { index }, `Stash ${action} 完成`)
    },

    createBranch: async (name, base, switchTo) => {
      return runRepoMutation('repo.branch.create', { name, base, switch: switchTo }, '分支已创建', {
        history: get().activePage === 'workspace'
      })
    },

    switchBranch: async (name) => {
      return runRepoMutation('repo.branch.switch', { name }, '分支已切换', {
        history: get().activePage === 'workspace'
      })
    },

    deleteBranch: async (name, force) => {
      return runRepoMutation('repo.branch.delete', { name, force }, '分支已删除', {
        history: get().activePage === 'workspace'
      })
    },

    checkoutTarget: async (target) => {
      return runRepoMutation('repo.checkout', { target }, `已签出到 ${target}`, {
        history: get().activePage === 'workspace'
      })
    },

    resolveConflict: async (file, side) => {
      await runRepoMutation('repo.conflict.resolve', { file, side }, '冲突已标记为已解决')
    },

    initRepo: async (path, remoteUrl) => {
      setLoading('mutation', true)
      try {
        const repo = await call<RepoInfo>('repo.init', { path, remoteUrl })
        get().toast('success', '仓库已初始化')
        await get().scanRepos()
        await get().selectRepo(repo.path)
        return true
      } catch (error) {
        fail(error, '初始化仓库失败')
        return false
      } finally {
        setLoading('mutation', false)
      }
    },

    loadCredentials: async () => {
      setLoading('credentials', true)
      try {
        const result = await call<{ credentials: Credential[] }>('credentials.list')
        set({ credentials: result.credentials })
      } catch (error) {
        fail(error, '读取凭据失败')
      } finally {
        setLoading('credentials', false)
      }
    },

    revealCredential: async (target) => {
      try {
        const credential = await call<Credential>('credentials.get', { target })
        set((state) => ({
          credentials: state.credentials.map((item) =>
            item.target === target ? { ...item, secret: credential.secret } : item
          )
        }))
      } catch (error) {
        fail(error, '读取凭据内容失败')
      }
    },

    deleteCredential: async (target) => {
      try {
        await call('credentials.delete', { target })
        get().toast('success', '凭据已删除')
        await get().loadCredentials()
      } catch (error) {
        fail(error, '删除凭据失败')
      }
    },

    clearGithubCredentials: async () => {
      try {
        const result = await call<{ credentials: Credential[] }>('credentials.clearGithub')
        set({ credentials: result.credentials })
        get().toast('success', 'GitHub 凭据已清除')
      } catch (error) {
        fail(error, '清除 GitHub 凭据失败')
      }
    },

    clearBinding: async () => {
      setLoading('credentials', true)
      try {
        await call('system.clearBinding')
        get().toast('success', '本机 Git 绑定已清除')
        await get().loadCredentials()
        await get().loadProxies()
      } catch (error) {
        fail(error, '清除本机绑定失败')
      } finally {
        setLoading('credentials', false)
      }
    },

    storeCredential: async (target, userName, secret) => {
      try {
        await call('credentials.store', { target, userName, secret })
        get().toast('success', '凭据已保存')
        await get().loadCredentials()
      } catch (error) {
        fail(error, '保存凭据失败')
      }
    },

    loadProxies: async () => {
      setLoading('proxies', true)
      try {
        const [git, system] = await Promise.all([
          call<GitProxyState>('proxy.git.get'),
          call<SystemProxyState>('proxy.system.get')
        ])
        set({ gitProxy: git, systemProxy: system })
      } catch (error) {
        fail(error, '读取代理设置失败')
      } finally {
        setLoading('proxies', false)
      }
    },

    setGitProxy: async (url) => {
      try {
        const result = await call<GitProxyState>('proxy.git.set', { url })
        set({ gitProxy: result })
        get().toast('success', 'Git 代理已保存')
      } catch (error) {
        fail(error, '设置 Git 代理失败')
      }
    },

    clearGitProxy: async () => {
      try {
        const result = await call<GitProxyState>('proxy.git.clear')
        set({ gitProxy: result })
        get().toast('success', 'Git 代理已清除')
      } catch (error) {
        fail(error, '清除 Git 代理失败')
      }
    },

    setSystemProxy: async (server) => {
      try {
        const result = await call<SystemProxyState>('proxy.system.set', { server })
        set({ systemProxy: result })
        get().toast('success', '系统代理已保存')
      } catch (error) {
        fail(error, '设置系统代理失败')
      }
    },

    clearSystemProxy: async () => {
      try {
        const result = await call<SystemProxyState>('proxy.system.clear')
        set({ systemProxy: result })
        get().toast('success', '系统代理已清除')
      } catch (error) {
        fail(error, '清除系统代理失败')
      }
    },

    loadSsh: async () => {
      setLoading('ssh', true)
      try {
        const ssh = await call<SshInfo>('ssh.list')
        set({ ssh })
      } catch (error) {
        fail(error, '读取 SSH 信息失败')
      } finally {
        setLoading('ssh', false)
      }
    },

    generateSshKey: async (keyPath, comment, overwrite) => {
      setLoading('ssh', true)
      try {
        const result = await call<{ publicKey: string; publicPath: string }>('ssh.generate', {
          keyPath,
          comment,
          overwrite
        })
        get().toast('success', 'SSH Key 已生成')
        await get().loadSsh()
        return result
      } catch (error) {
        fail(error, '生成 SSH Key 失败')
        return null
      } finally {
        setLoading('ssh', false)
      }
    },

    saveSshConfig: async (host, hostName, user, identityFile) => {
      try {
        await call('ssh.config.upsert', { host, hostName, user, identityFile })
        get().toast('success', 'SSH 配置已写入')
        await get().loadSsh()
        return true
      } catch (error) {
        fail(error, '写入 SSH 配置失败')
        return false
      }
    },

    testSsh: async (host) => {
      try {
        const result = await call<{ success: boolean; output: string }>('ssh.test', { host })
        get().toast(
          result.success ? 'success' : 'error',
          result.success ? 'SSH 连接成功' : 'SSH 连接失败',
          result.output
        )
        return result
      } catch (error) {
        fail(error, 'SSH 连接测试失败')
        return null
      }
    },

    testGithub: async (token) => {
      setLoading('github', true)
      try {
        const user = await call<GitHubUser>('github.test', { token })
        get().toast('success', `GitHub 已连接：${user.login}`)
        return user
      } catch (error) {
        fail(error, 'GitHub 连接失败')
        return null
      } finally {
        setLoading('github', false)
      }
    },

    listGithubRepos: async (token) => {
      setLoading('github', true)
      try {
        const result = await call<{ repos: GitHubRepo[] }>('github.listRepos', { token })
        return result.repos
      } catch (error) {
        fail(error, '读取 GitHub 仓库失败')
        return []
      } finally {
        setLoading('github', false)
      }
    },

    createGithubRepo: async (params) => {
      setLoading('github', true)
      try {
        const repo = await call<GitHubRepo>('github.createRepo', params)
        get().toast('success', `GitHub 仓库已创建：${repo.fullName}`)
        return repo
      } catch (error) {
        fail(error, '创建 GitHub 仓库失败')
        return null
      } finally {
        setLoading('github', false)
      }
    }
  }
})
