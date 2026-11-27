import { useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  HardDrive,
  Leaf,
  LayoutGrid,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Users,
  X
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { RepoInfo, Theme } from '@/types/api'
import { cn, initials } from '@/lib/utils'
import { Tooltip } from '@/components/ui'

const themeChoices: Array<{ id: Theme; label: string; icon: typeof Moon }> = [
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'sepia', label: '护眼', icon: Leaf }
]

interface DriveGroup {
  key: string
  label: string
  repos: RepoInfo[]
}

function getDriveKey(path: string): { key: string; label: string } {
  const match = path.match(/^([A-Za-z]):[\\/]/)
  if (match) {
    const letter = match[1].toUpperCase()
    return { key: letter, label: `${letter} 盘` }
  }
  return { key: '_OTHER', label: '其他目录' }
}

export function Sidebar() {
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const config = useAppStore((state) => state.config)
  const version = useAppStore((state) => state.version)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const repos = useAppStore((state) => state.repos)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const selectRepo = useAppStore((state) => state.selectRepo)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const loading = useAppStore((state) => state.loading)

  const [driveFilter, setDriveFilter] = useState<string>('all')
  const [collapsedDrives, setCollapsedDrives] = useState<Record<string, boolean>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const theme = config?.settings.theme ?? 'dark'
  const themeIndex = Math.max(0, themeChoices.findIndex((item) => item.id === theme))
  const currentThemeChoice = themeChoices[themeIndex] ?? themeChoices[0]
  const nextThemeChoice = themeChoices[(themeIndex + 1) % themeChoices.length]
  const ThemeIcon = currentThemeChoice.icon
  const defaultAccount = config?.accounts.find((account) => account.isDefault) ?? config?.accounts[0]
  const accountsActive = activePage === 'accounts'
  const settingsActive = activePage === 'settings'
  const selectedRepo = repos.find((item) => item.path === selectedRepoPath)

  const allDriveGroups = useMemo<DriveGroup[]>(() => {
    const map = new Map<string, DriveGroup>()
    for (const repo of repos) {
      const { key, label } = getDriveKey(repo.path)
      let group = map.get(key)
      if (!group) {
        group = { key, label, repos: [] }
        map.set(key, group)
      }
      group.repos.push(repo)
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === '_OTHER') return 1
      if (b.key === '_OTHER') return -1
      return a.key.localeCompare(b.key)
    })
  }, [repos])

  const activeDriveFilter =
    driveFilter !== 'all' && allDriveGroups.some((group) => group.key === driveFilter)
      ? driveFilter
      : 'all'

  const visibleDriveGroups = useMemo<DriveGroup[]>(() => {
    const q = query.trim().toLowerCase()
    return allDriveGroups
      .filter((group) => activeDriveFilter === 'all' || group.key === activeDriveFilter)
      .map((group) => ({
        ...group,
        repos: q
          ? group.repos.filter(
              (repo) =>
                repo.name.toLowerCase().includes(q) ||
                repo.branch.toLowerCase().includes(q) ||
                repo.path.toLowerCase().includes(q)
            )
          : group.repos
      }))
      .filter((group) => group.repos.length > 0)
  }, [activeDriveFilter, allDriveGroups, query])

  const handleSelectRepo = (path: string) => {
    void selectRepo(path)
    if (activePage !== 'workspace') {
      setActivePage('workspace')
    }
  }

  const toggleDrive = (key: string) => {
    setCollapsedDrives((previous) => ({ ...previous, [key]: !previous[key] }))
  }

  const toggleSearch = () => {
    setSearchOpen((previous) => {
      const next = !previous
      if (next) {
        window.setTimeout(() => searchInputRef.current?.focus(), 0)
      } else {
        setQuery('')
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'relative z-30 flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-elevated)] transition-[width] duration-150',
        sidebarCollapsed ? 'w-[56px]' : 'w-[216px]'
      )}
    >
      {sidebarCollapsed ? (
        <>
          <nav className="space-y-0.5 px-1.5 pt-2.5">
            <Tooltip
              content={selectedRepo ? `工作区 · ${selectedRepo.name}` : '工作区'}
              side="right"
            >
              <button
                type="button"
                aria-label="工作区"
                onClick={() => setActivePage('workspace')}
                className={cn(
                  'focus-ring relative flex h-9 w-full items-center justify-center rounded-md transition-colors',
                  activePage === 'workspace'
                    ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                )}
              >
                {activePage === 'workspace' ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}
                <GitBranch
                  className={cn(
                    'h-4 w-4 shrink-0',
                    activePage === 'workspace' ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                  )}
                />
              </button>
            </Tooltip>

            <Tooltip
              content={repos.length > 0 ? `仓库管理 (${repos.length})` : '仓库管理'}
              side="right"
            >
              <button
                type="button"
                aria-label="仓库管理"
                onClick={() => setActivePage('repos')}
                className={cn(
                  'focus-ring relative flex h-9 w-full items-center justify-center rounded-md transition-colors',
                  activePage === 'repos'
                    ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                )}
              >
                {activePage === 'repos' ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}
                <LayoutGrid
                  className={cn(
                    'h-4 w-4 shrink-0',
                    activePage === 'repos' ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                  )}
                />
              </button>
            </Tooltip>
          </nav>

          <div className="mt-auto flex flex-col items-center gap-1.5 border-t border-[var(--border)] px-1.5 py-2.5">
            <Tooltip
              content={defaultAccount ? `账户 · ${defaultAccount.name}` : '账户管理（未配置）'}
              side="right"
            >
              <button
                type="button"
                aria-label="账户管理"
                onClick={() => setActivePage('accounts')}
                className={cn(
                  'focus-ring relative flex h-9 w-full items-center justify-center rounded-md border transition-colors',
                  accountsActive
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--border-strong)]'
                )}
              >
                {accountsActive ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}
                {defaultAccount ? (
                  <span className="text-[11px] font-semibold text-[var(--accent)]">
                    {initials(defaultAccount.githubUser || defaultAccount.name)}
                  </span>
                ) : (
                  <Users className="h-4 w-4 text-[var(--faint)]" />
                )}
              </button>
            </Tooltip>

            <Tooltip content={`设置 · v${version}`} side="right">
              <button
                type="button"
                aria-label="设置"
                onClick={() => setActivePage('settings')}
                className={cn(
                  'focus-ring relative flex h-9 w-full items-center justify-center rounded-md border transition-colors',
                  settingsActive
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'border-transparent text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                )}
              >
                {settingsActive ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}
                <Settings2
                  className={cn(
                    'h-4 w-4',
                    settingsActive ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                  )}
                />
              </button>
            </Tooltip>

            <Tooltip content={`主题：${currentThemeChoice.label}（点击切换为${nextThemeChoice.label}）`} side="right">
              <button
                type="button"
                aria-label={`切换主题：${currentThemeChoice.label}`}
                onClick={() => updateSettings({ theme: nextThemeChoice.id })}
                className="focus-ring flex h-8 w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                <ThemeIcon className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        </>
      ) : (
        <>
          <div className="shrink-0 space-y-1.5 px-2.5 pt-2.5 pb-2">
            <div className="flex items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                <span className="text-xs font-semibold text-[var(--text-strong)]">仓库</span>
                {repos.length > 0 ? (
                  <span className="text-[11px] tabular-nums text-[var(--faint)]">{repos.length}</span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip content="筛选仓库">
                  <button
                    type="button"
                    aria-label="筛选仓库"
                    onClick={toggleSearch}
                    className={cn(
                      'focus-ring flex h-6 w-6 items-center justify-center rounded transition-colors',
                      searchOpen || query
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'text-[var(--faint)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                    )}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
                <Tooltip content="重新扫描">
                  <button
                    type="button"
                    aria-label="重新扫描"
                    disabled={loading.scan}
                    onClick={() => void scanRepos()}
                    className="focus-ring flex h-6 w-6 items-center justify-center rounded text-[var(--faint)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text)] disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loading.scan && 'animate-spin')} />
                  </button>
                </Tooltip>
                <Tooltip content="仓库总览与批量管理">
                  <button
                    type="button"
                    aria-label="仓库管理"
                    onClick={() => setActivePage('repos')}
                    className={cn(
                      'focus-ring flex h-6 w-6 items-center justify-center rounded transition-colors',
                      activePage === 'repos'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'text-[var(--faint)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {searchOpen ? (
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2 h-3 w-3 text-[var(--faint)]" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setQuery('')
                      setSearchOpen(false)
                    }
                  }}
                  placeholder="搜索仓库或分支…"
                  className="focus-ring h-7 w-full rounded-md border border-[var(--border)] bg-[var(--input-bg)] pl-6 pr-6 text-[11.5px] text-[var(--text)] placeholder:text-[var(--faint)]"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => setQuery('')}
                    className="absolute right-1.5 text-[var(--faint)] hover:text-[var(--text)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {allDriveGroups.length > 1 ? (
              <div className="flex items-center gap-0.5 rounded-md bg-[var(--panel-soft)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDriveFilter('all')}
                  className={cn(
                    'focus-ring flex-1 whitespace-nowrap rounded px-1.5 py-0.5 font-medium transition-colors',
                    activeDriveFilter === 'all'
                      ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  )}
                >
                  全部
                </button>
                {allDriveGroups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setDriveFilter(group.key)}
                    className={cn(
                      'focus-ring flex-1 whitespace-nowrap rounded px-1.5 py-0.5 font-medium transition-colors',
                      activeDriveFilter === group.key
                        ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    )}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {repos.length === 0 ? (
              <div className="px-2 py-6 text-center">
                <div className="text-xs text-[var(--muted)]">
                  {loading.scan ? '正在扫描仓库…' : '暂无已扫描仓库'}
                </div>
                <button
                  type="button"
                  onClick={() => setActivePage('settings')}
                  className="mt-1.5 text-[11px] text-[var(--accent)] hover:underline"
                >
                  去配置扫描目录
                </button>
              </div>
            ) : visibleDriveGroups.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-[var(--faint)]">
                没有匹配的仓库
              </div>
            ) : (
              <div className="space-y-2">
                {visibleDriveGroups.map((group) => {
                  const collapsed = Boolean(collapsedDrives[group.key]) && !query.trim()
                  return (
                    <div key={group.key}>
                      <button
                        type="button"
                        onClick={() => toggleDrive(group.key)}
                        className="focus-ring flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
                      >
                        {collapsed ? (
                          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                        )}
                        <HardDrive className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                        <span className="min-w-0 flex-1 truncate">{group.label}</span>
                        <span className="text-[10px] tabular-nums text-[var(--faint)]">
                          {group.repos.length}
                        </span>
                      </button>

                      {!collapsed ? (
                        <div className="mt-0.5 space-y-0.5">
                          {group.repos.map((repo) => {
                            const isSelected = repo.path === selectedRepoPath
                            const isWorkspaceActive = isSelected && activePage === 'workspace'
                            const branchName = repo.detached ? 'detached' : repo.branch || '无分支'
                            return (
                              <button
                                key={repo.path}
                                type="button"
                                onClick={() => handleSelectRepo(repo.path)}
                                title={`${repo.name}\n分支：${branchName}\n路径：${repo.path}`}
                                className={cn(
                                  'focus-ring relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors',
                                  isWorkspaceActive
                                    ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                                    : isSelected
                                      ? 'bg-[var(--panel-soft)] text-[var(--text-strong)]'
                                      : 'text-[var(--text)] hover:bg-[var(--panel-soft)]'
                                )}
                              >
                                {isWorkspaceActive ? (
                                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
                                ) : null}
                                <FolderGit2
                                  className={cn(
                                    'h-3.5 w-3.5 shrink-0',
                                    isWorkspaceActive
                                      ? 'text-[var(--accent)]'
                                      : 'text-[var(--faint)]'
                                  )}
                                />
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                                  {repo.name}
                                </span>
                                {repo.hasConflicts ? (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--danger)]"
                                    aria-label="存在冲突"
                                  />
                                ) : repo.dirty || repo.identityMismatch ? (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]"
                                    aria-label="有未提交改动或身份不一致"
                                  />
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-[var(--border)] p-2.5">
            <Tooltip content="账户切换与管理" side="right">
              <button
                type="button"
                onClick={() => setActivePage('accounts')}
                className={cn(
                  'focus-ring relative flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                  accountsActive
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--panel)] hover:border-[var(--border-strong)]'
                )}
              >
                {accountsActive ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
                  {defaultAccount ? (
                    initials(defaultAccount.githubUser || defaultAccount.name)
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-[var(--text-strong)]">
                    {defaultAccount ? defaultAccount.name : '账户管理'}
                  </div>
                  <div className="truncate text-[11px] text-[var(--faint)]">
                    {defaultAccount ? (defaultAccount.authType === 'ssh' ? 'SSH' : 'HTTPS') : '未配置账户'}
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
              </button>
            </Tooltip>

            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--panel)] p-0.5">
                {themeChoices.map((item) => {
                  const Icon = item.icon
                  const active = theme === item.id
                  return (
                    <Tooltip key={item.id} content={item.label}>
                      <button
                        type="button"
                        onClick={() => updateSettings({ theme: item.id })}
                        className={cn(
                          'focus-ring flex h-6 w-6 items-center justify-center rounded transition-colors',
                          active
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'text-[var(--faint)] hover:text-[var(--text)]'
                        )}
                        aria-label={item.label}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  )
                })}
              </div>

              <Tooltip content={`设置 · v${version}`}>
                <button
                  type="button"
                  onClick={() => setActivePage('settings')}
                  aria-label="设置"
                  className={cn(
                    'focus-ring flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
                    settingsActive
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-strong)]'
                      : 'border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]'
                  )}
                >
                  <Settings2
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      settingsActive ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                    )}
                  />
                  <span>设置</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
