import {
  ChevronDown,
  FolderGit2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import { Button, Kbd, Tooltip } from '@/components/ui'

export function TitleBar() {
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const repos = useAppStore((state) => state.repos)
  const selectRepo = useAppStore((state) => state.selectRepo)
  const status = useAppStore((state) => state.status)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const loading = useAppStore((state) => state.loading)
  const repo = repos.find((item) => item.path === selectedRepoPath)

  return (
    <header className="titlebar-drag relative z-40 flex h-10 shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3.5">
      <Tooltip content={sidebarCollapsed ? '展开左侧栏 (Ctrl+B)' : '收起左侧栏 (Ctrl+B)'} side="bottom">
        <Button
          variant="ghost"
          size="icon"
          aria-label={sidebarCollapsed ? '展开左侧栏' : '收起左侧栏'}
          className="titlebar-no-drag h-7 w-7 shrink-0 text-[var(--muted)] hover:text-[var(--text-strong)]"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </Tooltip>

      {repos.length > 0 ? (
        <div className="titlebar-no-drag relative flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--border-strong)]">
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
          <select
            value={selectedRepoPath}
            onChange={(event) => selectRepo(event.target.value)}
            aria-label="切换仓库"
            className="focus-ring max-w-[200px] cursor-pointer appearance-none truncate bg-transparent pr-4 font-medium text-[var(--text-strong)] outline-none"
          >
            {repos.map((item) => (
              <option key={item.path} value={item.path} className="bg-[var(--panel-solid)] text-[var(--text)]">
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none -ml-3.5 h-3 w-3 shrink-0 text-[var(--faint)]" />
          {repo ? (
            <>
              <span className="text-[var(--faint)]">/</span>
              <span className="max-w-[150px] truncate">
                {status ? status.branch || 'detached' : repo.detached ? 'detached' : repo.branch || 'detached'}
              </span>
              {status && (status.ahead > 0 || status.behind > 0) ? (
                <span className="ml-0.5 text-[11px] tabular-nums text-[var(--faint)]">
                  {status.ahead > 0 ? `↑${status.ahead}` : ''}
                  {status.behind > 0 ? ` ↓${status.behind}` : ''}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <span className="text-xs text-[var(--faint)]">未发现仓库</span>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="titlebar-no-drag hidden gap-2 text-[var(--muted)] sm:inline-flex"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="h-3.5 w-3.5" />
          <span>快速跳转</span>
          <Kbd>Ctrl K</Kbd>
        </Button>
        <Tooltip content="扫描仓库">
          <Button
            variant="ghost"
            size="icon"
            className="titlebar-no-drag"
            loading={loading.scan}
            onClick={() => scanRepos()}
          >
            {!loading.scan ? <RefreshCw className="h-3.5 w-3.5" /> : null}
          </Button>
        </Tooltip>
        <Tooltip content="退出">
          <Button
            variant="ghost"
            size="icon"
            className="titlebar-no-drag text-[var(--muted)] hover:text-[var(--danger)]"
            onClick={() => window.api.quit()}
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}
