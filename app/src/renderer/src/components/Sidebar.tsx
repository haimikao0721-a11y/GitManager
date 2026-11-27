import { ChevronRight, FolderGit2, GitBranch, Leaf, Moon, Settings2, Sun, Users } from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { PageId, Theme } from '@/types/api'
import { cn, initials } from '@/lib/utils'
import { Tooltip } from '@/components/ui'

const navItems: Array<{ id: Extract<PageId, 'repos' | 'workspace'>; label: string; icon: typeof FolderGit2 }> = [
  { id: 'repos', label: '仓库', icon: FolderGit2 },
  { id: 'workspace', label: '工作区', icon: GitBranch }
]

const themeChoices: Array<{ id: Theme; label: string; icon: typeof Moon }> = [
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'sepia', label: '护眼', icon: Leaf }
]

export function Sidebar() {
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const config = useAppStore((state) => state.config)
  const version = useAppStore((state) => state.version)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const theme = config?.settings.theme ?? 'dark'
  const themeIndex = Math.max(0, themeChoices.findIndex((item) => item.id === theme))
  const currentThemeChoice = themeChoices[themeIndex] ?? themeChoices[0]
  const nextThemeChoice = themeChoices[(themeIndex + 1) % themeChoices.length]
  const ThemeIcon = currentThemeChoice.icon
  const defaultAccount = config?.accounts.find((account) => account.isDefault) ?? config?.accounts[0]
  const repoCount = useAppStore((state) => state.repos.length)
  const accountsActive = activePage === 'accounts'
  const settingsActive = activePage === 'settings'

  return (
    <aside
      className={cn(
        'relative z-30 flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-elevated)] transition-[width] duration-150',
        sidebarCollapsed ? 'w-[56px]' : 'w-[196px]'
      )}
    >
      <nav className={cn('space-y-0.5 pt-2.5', sidebarCollapsed ? 'px-1.5' : 'px-2.5')}>
        {navItems.map((item) => {
          const active = activePage === item.id
          const Icon = item.icon
          const button = (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivePage(item.id)}
              aria-label={item.label}
              className={cn(
                'focus-ring relative flex h-9 w-full items-center rounded-md text-left text-[13px] font-medium transition-colors',
                sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                active
                  ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                  : 'text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[var(--accent)]" />
              ) : null}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                )}
              />
              {!sidebarCollapsed ? (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.id === 'repos' && repoCount > 0 ? (
                    <span className="text-[11px] tabular-nums text-[var(--faint)]">{repoCount}</span>
                  ) : null}
                </>
              ) : null}
            </button>
          )

          if (!sidebarCollapsed) return button
          const tooltipText = item.id === 'repos' && repoCount > 0 ? `${item.label} (${repoCount})` : item.label
          return (
            <Tooltip key={item.id} content={tooltipText} side="right">
              {button}
            </Tooltip>
          )
        })}
      </nav>

      {sidebarCollapsed ? (
        <div className="mt-auto flex flex-col items-center gap-1.5 px-1.5 pb-2.5">
          <Tooltip
            content={
              defaultAccount ? `账户 · ${defaultAccount.name}` : '账户管理（未配置）'
            }
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
      ) : (
        <div className="mt-auto space-y-2 p-2.5">
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
      )}
    </aside>
  )
}
