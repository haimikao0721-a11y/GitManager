import { FolderGit2, GitBranch, Leaf, Moon, Settings2, Sun, Users } from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { PageId, Theme } from '@/types/api'
import { cn, initials } from '@/lib/utils'
import { Tooltip } from '@/components/ui'

const navItems: Array<{ id: PageId; label: string; icon: typeof Users }> = [
  { id: 'accounts', label: '账户', icon: Users },
  { id: 'repos', label: '仓库', icon: FolderGit2 },
  { id: 'workspace', label: '工作区', icon: GitBranch },
  { id: 'settings', label: '设置', icon: Settings2 }
]

const themeChoices: Array<{ id: Theme; label: string; icon: typeof Moon }> = [
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'sepia', label: '护眼', icon: Leaf }
]

export function Sidebar() {
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const config = useAppStore((state) => state.config)
  const version = useAppStore((state) => state.version)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const theme = config?.settings.theme ?? 'dark'
  const defaultAccount = config?.accounts.find((account) => account.isDefault) ?? config?.accounts[0]
  const repoCount = useAppStore((state) => state.repos.length)

  return (
    <aside className="relative z-30 flex w-[196px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]">
      <nav className="space-y-0.5 px-2.5 pt-3">
        {navItems.map((item) => {
          const active = activePage === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={cn(
                'focus-ring relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors',
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
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.id === 'repos' && repoCount > 0 ? (
                <span className="text-[11px] tabular-nums text-[var(--faint)]">{repoCount}</span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto space-y-2.5 p-2.5">
        {defaultAccount ? (
          <button
            type="button"
            onClick={() => setActivePage('accounts')}
            className="focus-ring flex w-full items-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
              {initials(defaultAccount.githubUser || defaultAccount.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-[var(--text-strong)]">
                {defaultAccount.name}
              </div>
              <div className="truncate text-[11px] text-[var(--faint)]">
                {defaultAccount.authType === 'ssh' ? 'SSH' : 'HTTPS'}
              </div>
            </div>
          </button>
        ) : null}

        <div className="flex items-center justify-between gap-2 px-0.5">
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
                      'focus-ring flex h-6 w-7 items-center justify-center rounded transition-colors',
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
          <span className="text-[11px] tabular-nums text-[var(--faint)]">v{version}</span>
        </div>
      </div>
    </aside>
  )
}
