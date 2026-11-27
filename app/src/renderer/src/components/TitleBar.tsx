import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  FolderGit2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { RepoInfo } from '@/types/api'
import { Button, Kbd, Tooltip } from '@/components/ui'
import { cn } from '@/lib/utils'

function driveTag(path: string): string {
  const match = path.match(/^([A-Za-z]):[\\/]/)
  return match ? `${match[1].toUpperCase()}:` : ''
}

export function TitleBar() {
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const openRepoPaths = useAppStore((state) => state.openRepoPaths)
  const repos = useAppStore((state) => state.repos)
  const selectRepo = useAppStore((state) => state.selectRepo)
  const closeRepoTab = useAppStore((state) => state.closeRepoTab)
  const status = useAppStore((state) => state.status)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const loading = useAppStore((state) => state.loading)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number }>({ left: 16, top: 44 })

  const tabStripRef = useRef<HTMLDivElement | null>(null)
  const pickerBtnRef = useRef<HTMLButtonElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const pickerInputRef = useRef<HTMLInputElement | null>(null)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  const repoByPath = useMemo(() => {
    const map = new Map<string, RepoInfo>()
    for (const item of repos) {
      map.set(item.path, item)
    }
    return map
  }, [repos])

  const openTabRepos = useMemo(() => {
    const resolved = openRepoPaths
      .map((path) => repoByPath.get(path))
      .filter((item): item is RepoInfo => Boolean(item))
    if (resolved.length > 0) return resolved
    const current = repoByPath.get(selectedRepoPath) ?? repos[0]
    return current ? [current] : []
  }, [openRepoPaths, repoByPath, repos, selectedRepoPath])

  const filteredPickerRepos = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return repos
    return repos.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.branch.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q)
    )
  }, [pickerQuery, repos])

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedRepoPath, openTabRepos.length])

  const updatePickerPosition = () => {
    const trigger = pickerBtnRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = 272
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    setPickerPos({ left, top: rect.bottom + 6 })
  }

  const togglePicker = () => {
    if (!pickerOpen) {
      updatePickerPosition()
      setPickerQuery('')
      setPickerOpen(true)
      window.setTimeout(() => pickerInputRef.current?.focus(), 0)
    } else {
      setPickerOpen(false)
    }
  }

  useEffect(() => {
    if (!pickerOpen) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (pickerRef.current?.contains(target) || pickerBtnRef.current?.contains(target)) {
        return
      }
      setPickerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false)
    }
    const onResize = () => updatePickerPosition()
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [pickerOpen])

  const activateTab = (path: string) => {
    void selectRepo(path)
    if (activePage !== 'workspace') setActivePage('workspace')
  }

  return (
    <header className="titlebar-drag relative z-40 flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3.5">
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

      <div className="flex min-w-0 flex-1 items-center gap-1">
        {openTabRepos.length > 0 ? (
          <>
            <div
              ref={tabStripRef}
              onWheel={(event) => {
                const strip = tabStripRef.current
                if (!strip) return
                if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                  strip.scrollLeft += event.deltaY
                }
              }}
              className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
            >
              {openTabRepos.map((item) => {
                const isSelected = item.path === selectedRepoPath
                const isWorkspaceTab = isSelected && activePage === 'workspace'
                const branchLabel =
                  isSelected && status
                    ? status.branch || 'detached'
                    : item.detached
                      ? 'detached'
                      : item.branch || 'detached'
                const hasConflicts = isSelected && status ? status.hasConflicts : item.hasConflicts
                const dirty = isSelected && status ? status.files.length > 0 : item.dirty
                const ahead = isSelected && status ? status.ahead : item.ahead
                const behind = isSelected && status ? status.behind : item.behind
                const canClose = openTabRepos.length > 1

                return (
                  <button
                    key={item.path}
                    ref={isSelected ? activeTabRef : undefined}
                    type="button"
                    onClick={() => activateTab(item.path)}
                    onMouseDown={(event) => {
                      if (event.button === 1 && canClose) {
                        event.preventDefault()
                        void closeRepoTab(item.path)
                      }
                    }}
                    title={`${item.name} (${branchLabel})\n${item.path}\n快捷键：Alt+[ / Alt+] 切换视窗`}
                    className={cn(
                      'titlebar-no-drag focus-ring group relative flex h-7 max-w-[220px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                      isWorkspaceTab
                        ? 'border-[var(--border-strong)] bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                        : isSelected
                          ? 'border-[var(--border)] bg-[var(--panel-soft)] text-[var(--text-strong)]'
                          : 'border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                    )}
                  >
                    {hasConflicts ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--danger)]" />
                    ) : dirty ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]" />
                    ) : (
                      <FolderGit2
                        className={cn(
                          'h-3 w-3 shrink-0',
                          isSelected ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                        )}
                      />
                    )}
                    <span className="min-w-0 truncate font-medium">{item.name}</span>
                    <span className="max-w-[74px] shrink-0 truncate text-[10.5px] text-[var(--faint)]">
                      {branchLabel}
                    </span>
                    {ahead > 0 || behind > 0 ? (
                      <span className="shrink-0 text-[10px] tabular-nums text-[var(--faint)]">
                        {ahead > 0 ? `↑${ahead}` : ''}
                        {behind > 0 ? `↓${behind}` : ''}
                      </span>
                    ) : null}
                    {canClose ? (
                      <span
                        role="button"
                        aria-label={`关闭 ${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void closeRepoTab(item.path)
                        }}
                        className={cn(
                          'ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--faint)] transition-colors hover:bg-[var(--panel-hover)] hover:text-[var(--text-strong)]',
                          isSelected ? 'opacity-80' : 'opacity-0 group-hover:opacity-80'
                        )}
                      >
                        <X className="h-2.5 w-2.5" />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <Tooltip content="打开或切换其他仓库视窗" side="bottom">
              <Button
                ref={pickerBtnRef}
                variant="ghost"
                size="icon"
                aria-label="打开其他仓库视窗"
                aria-expanded={pickerOpen}
                className={cn(
                  'titlebar-no-drag h-7 w-7 shrink-0 text-[var(--muted)] hover:text-[var(--text-strong)]',
                  pickerOpen && 'bg-[var(--panel-soft)] text-[var(--text-strong)]'
                )}
                onClick={togglePicker}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </>
        ) : (
          <span className="text-xs text-[var(--faint)]">
            {loading.scan ? '正在扫描仓库…' : '未发现仓库'}
          </span>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
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

      {pickerOpen
        ? createPortal(
            <div
              ref={pickerRef}
              style={{ left: pickerPos.left, top: pickerPos.top, boxShadow: 'var(--shadow-lg)' }}
              className="fixed z-[110] flex w-[272px] flex-col rounded-lg border border-[var(--border-strong)] bg-[var(--panel-solid)] p-1.5"
            >
              <div className="relative mb-1.5 flex items-center">
                <Search className="pointer-events-none absolute left-2 h-3 w-3 text-[var(--faint)]" />
                <input
                  ref={pickerInputRef}
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder="搜索并打开仓库视窗…"
                  className="focus-ring h-7 w-full rounded-md border border-[var(--border)] bg-[var(--input-bg)] pl-6 pr-6 text-xs text-[var(--text)] placeholder:text-[var(--faint)]"
                />
                {pickerQuery ? (
                  <button
                    type="button"
                    aria-label="清空"
                    onClick={() => setPickerQuery('')}
                    className="absolute right-1.5 text-[var(--faint)] hover:text-[var(--text)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>

              <div className="max-h-[280px] space-y-0.5 overflow-y-auto">
                {filteredPickerRepos.length === 0 ? (
                  <div className="py-5 text-center text-xs text-[var(--faint)]">没有匹配的仓库</div>
                ) : (
                  filteredPickerRepos.map((item) => {
                    const isOpen = openTabRepos.some((tab) => tab.path === item.path)
                    const isCurrent = item.path === selectedRepoPath
                    const drive = driveTag(item.path)
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => {
                          activateTab(item.path)
                          setPickerOpen(false)
                        }}
                        className={cn(
                          'focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          isCurrent
                            ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                            : 'text-[var(--text)] hover:bg-[var(--panel-soft)]'
                        )}
                      >
                        <FolderGit2
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            isCurrent ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{item.name}</span>
                            {drive ? (
                              <span className="shrink-0 text-[10px] text-[var(--faint)]">{drive}</span>
                            ) : null}
                          </div>
                          <div className="truncate text-[10.5px] text-[var(--faint)]">
                            {item.detached ? 'detached' : item.branch || '无分支'}
                          </div>
                        </div>
                        {isOpen ? (
                          <Check
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              isCurrent ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                            )}
                          />
                        ) : null}
                      </button>
                    )
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </header>
  )
}
