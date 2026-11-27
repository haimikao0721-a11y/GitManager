import { useEffect, useMemo, useState } from 'react'
import {
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Leaf,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Users
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import { Dialog, Input, Kbd } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PageId } from '@/types/api'

interface Command {
  id: string
  label: string
  meta?: string
  icon: typeof Users
  run: () => void
}

export function CommandPalette() {
  const open = useAppStore((state) => state.paletteOpen)
  const setOpen = useAppStore((state) => state.setPaletteOpen)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const refreshRepo = useAppStore((state) => state.refreshRepo)
  const fetchRepo = useAppStore((state) => state.fetchRepo)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const config = useAppStore((state) => state.config)
  const repos = useAppStore((state) => state.repos)
  const selectRepo = useAppStore((state) => state.selectRepo)
  const activePage = useAppStore((state) => state.activePage)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const navigate = (page: PageId) => () => {
      setActivePage(page)
      setOpen(false)
    }
    const theme = config?.settings.theme ?? 'dark'
    const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'sepia' : 'dark'
    const nextThemeLabel = nextTheme === 'dark' ? '深色' : nextTheme === 'light' ? '浅色' : '护眼'

    const base: Command[] = [
      { id: 'accounts', label: '账户', icon: Users, run: navigate('accounts') },
      { id: 'repos', label: '仓库', icon: FolderGit2, run: navigate('repos') },
      {
        id: 'workspace',
        label: '工作区（变更）',
        icon: GitBranch,
        run: () => {
          setWorkspaceTab('changes')
          setActivePage('workspace')
          setOpen(false)
        }
      },
      {
        id: 'history',
        label: '工作区（提交历史）',
        icon: GitCommitHorizontal,
        run: () => {
          setWorkspaceTab('history')
          setActivePage('workspace')
          setOpen(false)
        }
      },
      { id: 'settings', label: '设置', icon: Settings2, run: navigate('settings') },
      {
        id: 'scan',
        label: '扫描仓库',
        icon: RefreshCw,
        run: () => {
          scanRepos()
          setOpen(false)
        }
      },
      {
        id: 'refresh',
        label: '刷新当前数据',
        icon: RefreshCw,
        run: () => {
          refreshRepo({ history: activePage === 'workspace' })
          setOpen(false)
        }
      },
      {
        id: 'fetch',
        label: '获取远程分支 (git fetch)',
        icon: GitBranch,
        run: () => {
          fetchRepo()
          setOpen(false)
        }
      },
      {
        id: 'theme',
        label: `切换主题为${nextThemeLabel}`,
        icon: nextTheme === 'dark' ? Moon : nextTheme === 'light' ? Sun : Leaf,
        run: () => {
          updateSettings({ theme: nextTheme })
          setOpen(false)
        }
      }
    ]

    const repoCommands: Command[] = repos.slice(0, 30).map((repo) => ({
      id: `repo:${repo.path}`,
      label: repo.name,
      meta: repo.path,
      icon: FolderGit2,
      run: () => {
        selectRepo(repo.path)
        setActivePage('workspace')
        setOpen(false)
      }
    }))
    return [...base, ...repoCommands]
  }, [
    activePage,
    config?.settings.theme,
    fetchRepo,
    refreshRepo,
    scanRepos,
    selectRepo,
    setActivePage,
    setWorkspaceTab,
    setOpen,
    updateSettings,
    repos
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(q) || (command.meta ?? '').toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  return (
    <Dialog open={open} onOpenChange={setOpen} title="快速跳转" width="max-w-lg">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(0, index - 1))
            } else if (event.key === 'Enter' && filtered[activeIndex]) {
              event.preventDefault()
              filtered[activeIndex].run()
            }
          }}
          placeholder="搜索页面、命令或仓库…"
          className="h-10 pl-9 pr-12"
        />
        <Kbd className="absolute right-3 top-1/2 -translate-y-1/2">Esc</Kbd>
      </div>

      <div className="max-h-[340px] space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--muted)]">没有匹配项</div>
        ) : (
          filtered.map((command, index) => {
            const Icon = command.icon
            const active = index === activeIndex
            return (
              <button
                key={command.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => command.run()}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'text-[var(--text)] hover:bg-[var(--panel-soft)]'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{command.label}</span>
                {command.meta ? (
                  <span className="code-font max-w-[210px] truncate text-[11px] text-[var(--faint)]">
                    {command.meta}
                  </span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </Dialog>
  )
}
