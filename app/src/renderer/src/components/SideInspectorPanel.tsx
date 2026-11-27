import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileDiff,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  UserRound,
  X
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import type {
  CommitDetailsResult,
  CommitFileChange,
  HistoryRow,
  RepoFileResult,
  RepoTreeEntry,
  RepoTreeResult,
  StatusFile
} from '@/types/api'
import { Badge, Button, EmptyState, Input, Spinner, Tooltip } from '@/components/ui'
import { DiffView } from '@/components/DiffView'
import { cn, copyText, parseDecorations } from '@/lib/utils'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  size: number
  children: TreeNode[]
}

interface SideInspectorPanelProps {
  onCreateBranchFromCommit: (baseHash: string) => void
  onOpenFileModal: (file: StatusFile, mode: 'unstaged' | 'staged') => void
}

function buildTree(entries: RepoTreeEntry[]): TreeNode[] {
  interface MutableDir {
    name: string
    path: string
    dirs: Map<string, MutableDir>
    files: TreeNode[]
  }

  const root: MutableDir = { name: '', path: '', dirs: new Map(), files: [] }

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let current = root
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i]
      let child = current.dirs.get(segment)
      if (!child) {
        const nextPath = current.path ? `${current.path}/${segment}` : segment
        child = { name: segment, path: nextPath, dirs: new Map(), files: [] }
        current.dirs.set(segment, child)
      }
      current = child
    }
    current.files.push({
      name: parts[parts.length - 1],
      path: entry.path,
      isDir: false,
      size: entry.size,
      children: []
    })
  }

  const toNodes = (dir: MutableDir): TreeNode[] => {
    const folders = [...dir.dirs.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((sub) => ({
        name: sub.name,
        path: sub.path,
        isDir: true,
        size: 0,
        children: toNodes(sub)
      }))
    const files = [...dir.files].sort((a, b) => a.name.localeCompare(b.name))
    return [...folders, ...files]
  }

  return toNodes(root)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function repoWebBaseUrl(url: string): string {
  if (!url) return ''
  return url
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
    .replace(/\.git$/, '')
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'accent' | 'muted' {
  const code = status.charAt(0).toUpperCase()
  if (code === 'A') return 'success'
  if (code === 'D') return 'danger'
  if (code === 'R' || code === 'C') return 'accent'
  if (code === 'M') return 'warning'
  return 'muted'
}

export function SideInspectorPanel({
  onCreateBranchFromCommit,
  onOpenFileModal
}: SideInspectorPanelProps) {
  const repos = useAppStore((state) => state.repos)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const inspectorFocus = useAppStore((state) => state.inspectorFocus)
  const setInspectorFocus = useAppStore((state) => state.setInspectorFocus)
  const status = useAppStore((state) => state.status)
  const stashes = useAppStore((state) => state.stashes)
  const history = useAppStore((state) => state.history)
  const inspectorTab = useAppStore((state) => state.inspectorTab)
  const inspectorWidth = useAppStore((state) => state.inspectorWidth)
  const selectedCommitHash = useAppStore((state) => state.selectedCommitHash)
  const selectedCommitFile = useAppStore((state) => state.selectedCommitFile)
  const selectedWorkFile = useAppStore((state) => state.selectedWorkFile)
  const setInspectorOpen = useAppStore((state) => state.setInspectorOpen)
  const setInspectorTab = useAppStore((state) => state.setInspectorTab)
  const setInspectorWidth = useAppStore((state) => state.setInspectorWidth)
  const setSelectedCommitHash = useAppStore((state) => state.setSelectedCommitHash)
  const setSelectedCommitFile = useAppStore((state) => state.setSelectedCommitFile)
  const setSelectedWorkFile = useAppStore((state) => state.setSelectedWorkFile)
  const checkoutTarget = useAppStore((state) => state.checkoutTarget)
  const refreshRepo = useAppStore((state) => state.refreshRepo)

  const repo = repos.find((item) => item.path === selectedRepoPath)
  const rows = history?.rows ?? []
  const selectedHistoryRow: HistoryRow | null = useMemo(() => {
    if (rows.length === 0) return null
    return rows.find((row) => row.hash === selectedCommitHash) ?? rows[0] ?? null
  }, [rows, selectedCommitHash])
  const isHistoryMode = inspectorFocus === 'commit'

  const targetRef = isHistoryMode ? selectedHistoryRow?.hash || 'HEAD' : 'HEAD'

  const [details, setDetails] = useState<CommitDetailsResult | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [treeResult, setTreeResult] = useState<RepoTreeResult | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    if (!resizing) return
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - event.clientX
      setInspectorWidth(dragRef.current.startWidth + delta)
    }
    const onUp = () => {
      dragRef.current = null
      setResizing(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizing, setInspectorWidth])

  useEffect(() => {
    if (!selectedRepoPath) {
      setDetails(null)
      return
    }
    if (isHistoryMode && !selectedHistoryRow?.hash) {
      setDetails(null)
      return
    }
    let cancelled = false
    setDetailsLoading(true)
    window.api
      .invoke<CommitDetailsResult>('repo.commitDetails', {
        path: selectedRepoPath,
        hash: targetRef
      })
      .then((result) => {
        if (!cancelled) setDetails(result)
      })
      .catch((error) => {
        if (!cancelled) {
          setDetails({
            hash: targetRef,
            shortHash: targetRef,
            author: '',
            email: '',
            date: '',
            subject: '',
            body: '',
            files: [],
            fileCount: 0,
            totalAdditions: 0,
            totalDeletions: 0,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isHistoryMode, selectedHistoryRow?.hash, selectedRepoPath, targetRef, status?.branch])

  useEffect(() => {
    if (!selectedRepoPath) {
      setTreeResult(null)
      return
    }
    if (isHistoryMode && !selectedHistoryRow?.hash) {
      setTreeResult(null)
      return
    }
    let cancelled = false
    setTreeLoading(true)
    window.api
      .invoke<RepoTreeResult>('repo.tree', {
        path: selectedRepoPath,
        ref: targetRef
      })
      .then((result) => {
        if (!cancelled) setTreeResult(result)
      })
      .catch((error) => {
        if (!cancelled) {
          setTreeResult({
            ref: targetRef,
            entries: [],
            fileCount: 0,
            totalSize: 0,
            truncated: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isHistoryMode, selectedHistoryRow?.hash, selectedRepoPath, targetRef, status?.branch])

  const workingFiles = status?.files ?? []
  const mergedTreeEntries = useMemo(() => {
    const base = treeResult?.entries ?? []
    if (isHistoryMode || workingFiles.length === 0) return base
    const map = new Map<string, RepoTreeEntry>()
    for (const entry of base) map.set(entry.path, entry)
    for (const file of workingFiles) {
      if (file.untracked && !map.has(file.path)) {
        map.set(file.path, { path: file.path, size: 0 })
      }
    }
    return [...map.values()]
  }, [isHistoryMode, treeResult?.entries, workingFiles])

  const changesCount = isHistoryMode ? details?.fileCount ?? 0 : workingFiles.length
  const treeCount = isHistoryMode
    ? treeResult?.fileCount ?? mergedTreeEntries.length
    : Math.max(treeResult?.fileCount ?? 0, mergedTreeEntries.length)

  if (!repo) return null

  const isExpanded = inspectorWidth >= 560
  const headerHash = selectedHistoryRow?.hash || details?.shortHash || ''
  const headerAuthor = selectedHistoryRow?.author || details?.author || ''
  const headerDate = selectedHistoryRow?.date || details?.date || ''
  const headerSubject = selectedHistoryRow?.subject || details?.subject || ''

  const copyHash = async (hash: string) => {
    if (!hash) return
    await copyText(hash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 1500)
  }

  return (
    <aside
      style={{ width: inspectorWidth }}
      className="relative flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel-solid)]"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整右侧栏宽度"
        onMouseDown={(event) => {
          event.preventDefault()
          dragRef.current = { startX: event.clientX, startWidth: inspectorWidth }
          setResizing(true)
        }}
        className={cn(
          'absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize transition-colors',
          resizing ? 'bg-[var(--accent)]/40' : 'hover:bg-[var(--accent)]/25'
        )}
      />

      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border)] bg-[var(--panel-soft)]/70 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--panel)] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setInspectorFocus('working')}
              className={cn(
                'focus-ring rounded px-2 py-0.5 font-medium transition-colors',
                !isHistoryMode
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              )}
            >
              工作区{workingFiles.length > 0 ? ` (${workingFiles.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setInspectorFocus('commit')}
              className={cn(
                'focus-ring rounded px-2 py-0.5 font-medium transition-colors',
                isHistoryMode
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              )}
            >
              提交 {selectedHistoryRow?.hash || ''}
            </button>
          </div>
          {isHistoryMode ? (
            selectedHistoryRow ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1 font-medium text-[var(--text-strong)]">
                    <UserRound className="h-3 w-3 text-[var(--faint)]" />
                    {headerAuthor || '未知作者'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyHash(details?.hash || headerHash)}
                    className="code-font inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] text-[var(--text)] hover:border-[var(--border-strong)]"
                    title="复制提交哈希"
                  >
                    {headerHash}
                    {copiedHash ? (
                      <Check className="h-2.5 w-2.5 text-[var(--success)]" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 text-[var(--faint)]" />
                    )}
                  </button>
                  <span className="tabular-nums text-[var(--faint)]">{headerDate}</span>
                </div>
                <div className="mt-1 truncate text-xs font-semibold text-[var(--text-strong)]" title={headerSubject}>
                  {headerSubject || '(无提交说明)'}
                </div>
              </>
            ) : (
              <div className="text-xs text-[var(--faint)]">在左侧提交历史中选择一个提交节点</div>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1 font-medium text-[var(--text-strong)]">
                  <GitBranch className="h-3 w-3 text-[var(--accent)]" />
                  {status?.branch || repo.branch || 'detached'}
                </span>
                <span>·</span>
                <span className="tabular-nums">
                  {workingFiles.length > 0 ? `${workingFiles.length} 个未提交变更` : '工作区干净'}
                </span>
                {stashes.length > 0 ? (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">{stashes.length} 个 Stash</span>
                  </>
                ) : null}
              </div>
              <div className="mt-1 truncate text-xs text-[var(--muted)]" title={headerSubject}>
                {headerHash ? `HEAD ${headerHash} · ${headerSubject}` : repo.name}
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip content={isExpanded ? '恢复默认宽度' : '加宽扩展区域'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setInspectorWidth(isExpanded ? 440 : 640)}
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </Tooltip>
          <Tooltip content="收起右侧面板 (Ctrl+Shift+B)">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setInspectorOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--panel)] px-3 pt-1.5">
        <InspectorTabButton
          active={inspectorTab === 'commit'}
          label="提交"
          onClick={() => setInspectorTab('commit')}
        />
        <InspectorTabButton
          active={inspectorTab === 'changes'}
          label="变更"
          count={changesCount}
          onClick={() => setInspectorTab('changes')}
        />
        <InspectorTabButton
          active={inspectorTab === 'tree'}
          label="文件树"
          count={treeCount}
          onClick={() => setInspectorTab('tree')}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {inspectorTab === 'commit' ? (
          <CommitTab
            isHistoryMode={isHistoryMode}
            row={selectedHistoryRow}
            details={details}
            loading={detailsLoading}
            repo={repo}
            statusFiles={workingFiles}
            onSelectCommit={(hash) => setSelectedCommitHash(hash)}
            onCheckout={(hash) => void checkoutTarget(hash)}
            onCreateBranch={onCreateBranchFromCommit}
            onGoChanges={() => setInspectorTab('changes')}
            onGoTree={() => setInspectorTab('tree')}
          />
        ) : inspectorTab === 'changes' ? (
          <ChangesTab
            repoPath={repo.path}
            isHistoryMode={isHistoryMode}
            row={selectedHistoryRow}
            details={details}
            loading={detailsLoading}
            selectedCommitFile={selectedCommitFile}
            onSelectCommitFile={setSelectedCommitFile}
            workingFiles={workingFiles}
            selectedWorkFile={selectedWorkFile}
            onSelectWorkFile={setSelectedWorkFile}
            onOpenFileModal={onOpenFileModal}
            onWorkChanged={() => refreshRepo({ history: false })}
          />
        ) : (
          <TreeTab
            repoPath={repo.path}
            targetRef={isHistoryMode ? selectedHistoryRow?.hash || 'HEAD' : 'HEAD'}
            isHistoryMode={isHistoryMode}
            entries={mergedTreeEntries}
            fileCount={treeCount}
            totalSize={treeResult?.totalSize ?? 0}
            truncated={treeResult?.truncated ?? false}
            loading={treeLoading}
            error={treeResult?.error}
            workingFiles={workingFiles}
          />
        )}
      </div>
    </aside>
  )
}

function InspectorTabButton({
  active,
  label,
  count,
  onClick
}: {
  active: boolean
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring relative inline-flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--accent)] text-[var(--text-strong)]'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
      )}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] tabular-nums leading-none',
            active
              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'bg-[var(--panel-soft)] text-[var(--faint)]'
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

function CommitTab({
  isHistoryMode,
  row,
  details,
  loading,
  repo,
  statusFiles,
  onSelectCommit,
  onCheckout,
  onCreateBranch,
  onGoChanges,
  onGoTree
}: {
  isHistoryMode: boolean
  row: HistoryRow | null
  details: CommitDetailsResult | null
  loading: boolean
  repo: { path: string; url: string; branch: string }
  statusFiles: StatusFile[]
  onSelectCommit: (hash: string) => void
  onCheckout: (hash: string) => void
  onCreateBranch: (hash: string) => void
  onGoChanges: () => void
  onGoTree: () => void
}) {
  const [copied, setCopied] = useState(false)
  const webUrl = useMemo(() => repoWebBaseUrl(repo.url), [repo.url])
  const decorations = parseDecorations(row?.decorations ?? '')
  const commitHash = details?.hash || row?.hash || ''
  const shortHash = row?.hash || details?.shortHash || ''

  if (loading && !details) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (isHistoryMode && !row) {
    return (
      <EmptyState
        icon={<GitCommitHorizontal className="h-5 w-5" />}
        title="未选择提交"
        description="点击左侧提交记录后即可在这里查看提交详情、文件变更和完整文件树。"
        className="h-full"
      />
    )
  }

  const copy = async () => {
    if (!commitHash) return
    await copyText(commitHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      {!isHistoryMode ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-strong)]">当前工作区概览</span>
            <Badge variant={statusFiles.length > 0 ? 'warning' : 'success'}>
              {statusFiles.length > 0 ? `${statusFiles.length} 个文件待处理` : '干净'}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5">
              <div className="text-[10px] text-[var(--faint)]">已暂存</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[var(--success)]">
                {statusFiles.filter((file) => file.staged && !file.conflicted).length}
              </div>
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5">
              <div className="text-[10px] text-[var(--faint)]">未暂存</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[var(--warning)]">
                {statusFiles.filter((file) => (file.unstaged || file.untracked) && !file.conflicted).length}
              </div>
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5">
              <div className="text-[10px] text-[var(--faint)]">冲突</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[var(--danger)]">
                {statusFiles.filter((file) => file.conflicted).length}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onGoChanges}>
              查看工作区变更 ({statusFiles.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={onGoTree}>
              浏览文件树
            </Button>
          </div>
        </div>
      ) : null}

      {details?.empty ? (
        <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--faint)]">
          当前仓库尚无提交记录
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
              {isHistoryMode ? '提交说明' : '最新 HEAD 提交'}
            </div>
            <div className="text-[13px] font-semibold leading-6 text-[var(--text-strong)]">
              {details?.subject || row?.subject || '(无提交说明)'}
            </div>
            {details?.body ? (
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-2.5 font-sans text-xs leading-5 text-[var(--text)]">
                {details.body}
              </pre>
            ) : null}
          </div>

          {commitHash ? (
            <div>
              <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">提交哈希</div>
              <div className="flex items-center gap-1.5">
                <code className="code-font min-w-0 flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-xs text-[var(--text)]">
                  {commitHash}
                </code>
                <Tooltip content={copied ? '已复制' : '复制'}>
                  <Button size="icon" variant="ghost" onClick={() => void copy()}>
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </Tooltip>
                {webUrl ? (
                  <Tooltip content="在 GitHub 打开">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => window.api.openExternal(`${webUrl}/commit/${commitHash}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-2">
              <div className="text-[11px] text-[var(--faint)]">作者</div>
              <div className="mt-0.5 truncate text-xs font-medium text-[var(--text-strong)]">
                {details?.author || row?.author || '-'}
              </div>
              {details?.email ? (
                <div className="truncate text-[10px] text-[var(--faint)]">{details.email}</div>
              ) : null}
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-2">
              <div className="text-[11px] text-[var(--faint)]">日期</div>
              <div className="mt-0.5 truncate text-xs font-medium tabular-nums text-[var(--text-strong)]">
                {details?.date || row?.date || '-'}
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-[var(--faint)]">
                变更 {details?.fileCount ?? 0} 个文件 (+{details?.totalAdditions ?? 0} / -
                {details?.totalDeletions ?? 0})
              </div>
            </div>
          </div>

          {decorations.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">分支 / 标签</div>
              <div className="flex flex-wrap gap-1">
                {decorations.map((chip, index) => (
                  <span
                    key={`${chip.text}-${index}`}
                    className={cn(
                      'max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-3.5',
                      chip.kind === 'head' && 'border-transparent bg-[var(--text-strong)] text-[var(--bg)]',
                      chip.kind === 'tag' &&
                        'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]',
                      chip.kind === 'remote' &&
                        'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]',
                      chip.kind === 'branch' &&
                        'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    )}
                  >
                    {chip.text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {isHistoryMode && row ? (
            <>
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
                  父提交 ({row.parents.length})
                </div>
                {row.parents.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--faint)]">
                    根提交
                  </div>
                ) : (
                  <div className="space-y-1">
                    {row.parents.map((parent) => (
                      <button
                        key={parent}
                        type="button"
                        onClick={() => onSelectCommit(parent)}
                        className="focus-ring flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--border-strong)]"
                      >
                        <GitCommitHorizontal className="h-3.5 w-3.5 text-[var(--faint)]" />
                        <span className="code-font truncate text-xs text-[var(--text)]">{parent}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={onGoChanges}>
                  <FileDiff className="h-3.5 w-3.5" />
                  查看变更 ({details?.fileCount ?? 0})
                </Button>
                <Button size="sm" variant="secondary" onClick={onGoTree}>
                  查看文件树
                </Button>
                {shortHash ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => onCheckout(shortHash)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      签出到此节点
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onCreateBranch(shortHash)}>
                      <GitBranchPlus className="h-3.5 w-3.5" />
                      新建分支
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

function ChangesTab({
  repoPath,
  isHistoryMode,
  row,
  details,
  loading,
  selectedCommitFile,
  onSelectCommitFile,
  workingFiles,
  selectedWorkFile,
  onSelectWorkFile,
  onOpenFileModal,
  onWorkChanged
}: {
  repoPath: string
  isHistoryMode: boolean
  row: HistoryRow | null
  details: CommitDetailsResult | null
  loading: boolean
  selectedCommitFile: string
  onSelectCommitFile: (file: string) => void
  workingFiles: StatusFile[]
  selectedWorkFile: { path: string; mode: 'unstaged' | 'staged' } | null
  onSelectWorkFile: (file: { path: string; mode: 'unstaged' | 'staged' } | null) => void
  onOpenFileModal: (file: StatusFile, mode: 'unstaged' | 'staged') => void
  onWorkChanged: () => Promise<void>
}) {
  if (isHistoryMode) {
    if (!row) {
      return (
        <EmptyState
          icon={<FileDiff className="h-5 w-5" />}
          title="未选择提交"
          description="选择左侧提交后查看变更文件与详细差异。"
          className="h-full"
        />
      )
    }

    if (loading && !details) {
      return (
        <div className="flex h-full items-center justify-center py-12">
          <Spinner />
        </div>
      )
    }

    const commitFiles: CommitFileChange[] = details?.files ?? []
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--panel-soft)]/50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-medium text-[var(--muted)]">
              变更文件 ({commitFiles.length})
            </span>
            <span className="tabular-nums text-[var(--faint)]">
              <span className="text-[var(--success)]">+{details?.totalAdditions ?? 0}</span>
              {' / '}
              <span className="text-[var(--danger)]">-{details?.totalDeletions ?? 0}</span>
            </span>
          </div>
        </div>

        <div className="max-h-[210px] shrink-0 divide-y divide-[var(--border)] overflow-y-auto border-b border-[var(--border)]">
          <button
            type="button"
            onClick={() => onSelectCommitFile('')}
            className={cn(
              'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors',
              !selectedCommitFile
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-strong)]'
                : 'text-[var(--muted)] hover:bg-[var(--panel-soft)]'
            )}
          >
            <span>全部改动（合并视图）</span>
            <span className="text-[10px] tabular-nums text-[var(--faint)]">{commitFiles.length} 个文件</span>
          </button>
          {commitFiles.map((file) => {
            const active = selectedCommitFile === file.path
            return (
              <button
                key={`${file.status}:${file.path}`}
                type="button"
                onClick={() => onSelectCommitFile(file.path)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                    : 'text-[var(--text)] hover:bg-[var(--panel-soft)]'
                )}
              >
                <Badge variant={statusBadgeVariant(file.status)} className="shrink-0">
                  {file.label}
                </Badge>
                <span className="min-w-0 flex-1 truncate code-font text-[11px]" title={file.path}>
                  {file.path}
                </span>
                {!file.binary ? (
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--faint)]">
                    <span className="text-[var(--success)]">+{file.additions}</span>{' '}
                    <span className="text-[var(--danger)]">-{file.deletions}</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-[var(--faint)]">二进制</span>
                )}
              </button>
            )
          })}
          {commitFiles.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-[var(--faint)]">该提交无文件改动</div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <DiffView
            repoPath={repoPath}
            commit={row.hash}
            commitFile={selectedCommitFile || undefined}
            className="h-full min-h-0"
          />
        </div>
      </div>
    )
  }

  const activeWork =
    (selectedWorkFile &&
      workingFiles.find((file) => file.path === selectedWorkFile.path) &&
      selectedWorkFile) ||
    (workingFiles[0]
      ? {
          path: workingFiles[0].path,
          mode: (workingFiles[0].unstaged || workingFiles[0].untracked ? 'unstaged' : 'staged') as
            | 'unstaged'
            | 'staged'
        }
      : null)

  const activeFileObj = activeWork ? workingFiles.find((file) => file.path === activeWork.path) : undefined

  if (workingFiles.length === 0) {
    return (
      <EmptyState
        icon={<Check className="h-5 w-5" />}
        title="工作区没有变更"
        description="修改、新增或暂存文件后，这里会实时列出并支持在侧栏直接预览差异。"
        className="h-full"
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--panel-soft)]/50 px-3 py-2 text-[11px]">
        <span className="font-medium text-[var(--muted)]">工作区变更 ({workingFiles.length})</span>
        {activeFileObj && activeWork ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => onOpenFileModal(activeFileObj, activeWork.mode)}
          >
            大窗对比
          </Button>
        ) : null}
      </div>

      <div className="max-h-[190px] shrink-0 divide-y divide-[var(--border)] overflow-y-auto border-b border-[var(--border)]">
        {workingFiles.map((file) => {
          const mode: 'unstaged' | 'staged' =
            file.unstaged || file.untracked ? 'unstaged' : 'staged'
          const active = activeWork?.path === file.path
          return (
            <button
              key={`${file.xy}:${file.path}`}
              type="button"
              onClick={() => onSelectWorkFile({ path: file.path, mode })}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                active
                  ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]'
                  : 'text-[var(--text)] hover:bg-[var(--panel-soft)]'
              )}
            >
              <span className="code-font w-5 shrink-0 text-[10px] font-semibold text-[var(--faint)]">
                {file.xy}
              </span>
              <span className="min-w-0 flex-1 truncate code-font text-[11px]" title={file.displayPath}>
                {file.displayPath}
              </span>
              <Badge
                variant={
                  file.conflicted
                    ? 'danger'
                    : file.untracked
                      ? 'accent'
                      : file.staged && !file.unstaged
                        ? 'success'
                        : 'warning'
                }
              >
                {file.label}
              </Badge>
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {activeFileObj && activeWork ? (
          <DiffView
            repoPath={repoPath}
            file={activeFileObj.path}
            initialMode={activeWork.mode}
            unstagedAvailable={activeFileObj.unstaged || activeFileObj.untracked}
            stagedAvailable={activeFileObj.staged}
            className="h-full min-h-0"
            onChanged={onWorkChanged}
          />
        ) : null}
      </div>
    </div>
  )
}

function TreeTab({
  repoPath,
  targetRef,
  isHistoryMode,
  entries,
  fileCount,
  totalSize,
  truncated,
  loading,
  error,
  workingFiles
}: {
  repoPath: string
  targetRef: string
  isHistoryMode: boolean
  entries: RepoTreeEntry[]
  fileCount: number
  totalSize: number
  truncated: boolean
  loading: boolean
  error?: string
  workingFiles: StatusFile[]
}) {
  const [query, setQuery] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set())
  const [selectedFile, setSelectedFile] = useState('')
  const [preview, setPreview] = useState<RepoFileResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const workingStatusMap = useMemo(() => {
    const map = new Map<string, StatusFile>()
    if (!isHistoryMode) {
      for (const file of workingFiles) map.set(file.path, file)
    }
    return map
  }, [isHistoryMode, workingFiles])

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) => entry.path.toLowerCase().includes(q))
  }, [entries, query])

  const treeNodes = useMemo(() => buildTree(filteredEntries), [filteredEntries])

  useEffect(() => {
    setExpandedDirs((prev) => {
      if (prev.size > 0) return prev
      const initial = new Set<string>()
      for (const node of treeNodes) {
        if (node.isDir) initial.add(node.path)
      }
      return initial
    })
  }, [treeNodes])

  const loadFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath)
      setPreviewLoading(true)
      const fileRef = !isHistoryMode ? 'WORKTREE' : targetRef
      try {
        const result = await window.api.invoke<RepoFileResult>('repo.file', {
          path: repoPath,
          ref: fileRef,
          file: filePath
        })
        setPreview(result)
      } catch (err) {
        setPreview({
          path: filePath,
          ref: fileRef,
          content: '',
          error: err instanceof Error ? err.message : String(err)
        })
      } finally {
        setPreviewLoading(false)
      }
    },
    [isHistoryMode, repoPath, targetRef]
  )

  useEffect(() => {
    if (!selectedFile) return
    if (!entries.some((entry) => entry.path === selectedFile)) {
      setSelectedFile('')
      setPreview(null)
      return
    }
    void loadFile(selectedFile)
  }, [entries, loadFile, selectedFile])

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }

  const forceExpand = query.trim().length > 0

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode => {
    return nodes.map((node) => {
      if (node.isDir) {
        const open = forceExpand || expandedDirs.has(node.path)
        return (
          <div key={`dir:${node.path}`}>
            <button
              type="button"
              onClick={() => toggleDir(node.path)}
              style={{ paddingLeft: `${10 + depth * 14}px` }}
              className="flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--panel-soft)]"
            >
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-[var(--faint)]" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--faint)]" />
              )}
              {open ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            </button>
            {open ? renderNodes(node.children, depth + 1) : null}
          </div>
        )
      }

      const active = selectedFile === node.path
      const wf = workingStatusMap.get(node.path)
      return (
        <button
          key={`file:${node.path}`}
          type="button"
          onClick={() => void loadFile(node.path)}
          style={{ paddingLeft: `${26 + depth * 14}px` }}
          className={cn(
            'flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs transition-colors',
            active
              ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-strong)]'
              : 'text-[var(--text)] hover:bg-[var(--panel-soft)]'
          )}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
          <span className="min-w-0 flex-1 truncate" title={node.path}>
            {node.name}
          </span>
          {wf ? (
            <span className="code-font shrink-0 rounded bg-[var(--warning-soft)] px-1 text-[10px] text-[var(--warning)]">
              {wf.xy.trim() || 'M'}
            </span>
          ) : null}
          {node.size > 0 ? (
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--faint)]">
              {formatBytes(node.size)}
            </span>
          ) : null}
        </button>
      )
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-[var(--border)] bg-[var(--panel-soft)]/50 p-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
          <span>
            共 <strong className="tabular-nums text-[var(--text-strong)]">{fileCount}</strong> 个文件
            {totalSize > 0 ? ` · ${formatBytes(totalSize)}` : ''}
          </span>
          <span className="code-font text-[10px] text-[var(--faint)]">
            {isHistoryMode ? targetRef : '工作区'}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="过滤文件树路径…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        {truncated ? (
          <div className="text-[10px] text-[var(--warning)]">文件数量过多，当前展示前 15,000 个条目。</div>
        ) : null}
      </div>

      <div className="max-h-[250px] min-h-[140px] shrink-0 overflow-y-auto border-b border-[var(--border)] py-1">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-xs text-[var(--danger)]">{error}</div>
        ) : treeNodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--faint)]">
            {query ? '没有匹配的文件' : '暂无可显示的文件树'}
          </div>
        ) : (
          renderNodes(treeNodes, 0)
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        {!selectedFile ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="选择文件查看内容"
            description="点击上方文件树中的任意文件，在此预览对应版本内容。"
            className="flex-1"
          />
        ) : previewLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : preview?.error ? (
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
            {preview.error}
          </div>
        ) : preview?.binary ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3 text-xs text-[var(--muted)]">
            二进制文件无法作为文本预览（{formatBytes(preview.size ?? 0)}）。
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel-solid)]">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-[11px]">
              <span className="code-font min-w-0 flex-1 truncate text-[var(--text-strong)]" title={selectedFile}>
                {selectedFile}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--faint)]">
                {formatBytes(preview?.size ?? 0)}
                {preview?.truncated ? ' · 仅前 256 KB' : ''}
              </span>
            </div>
            <pre className="code-font min-h-0 flex-1 overflow-auto whitespace-pre p-3 text-[11px] leading-5 text-[var(--text)]">
              {preview?.content ?? ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
