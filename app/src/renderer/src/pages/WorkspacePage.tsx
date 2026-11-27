import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  Download,
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  Maximize2,
  Minimize2,
  PanelRight,
  Play,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { Branch, HistoryResult, HistoryRow, StatusFile } from '@/types/api'
import {
  Badge,
  Button,
  Card,
  ContextMenu,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
  Textarea,
  Tooltip,
  type ContextMenuItem
} from '@/components/ui'
import { HistoryView } from '@/components/HistoryView'
import { DiffView } from '@/components/DiffView'
import { SideInspectorPanel } from '@/components/SideInspectorPanel'
import { cn, copyText, parseDecorations, shortPath } from '@/lib/utils'

interface ConfirmState {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  action: () => Promise<void> | void
}

export function WorkspacePage() {
  const repos = useAppStore((state) => state.repos)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const selectRepo = useAppStore((state) => state.selectRepo)
  const config = useAppStore((state) => state.config)
  const status = useAppStore((state) => state.status)
  const branches = useAppStore((state) => state.branches)
  const stashes = useAppStore((state) => state.stashes)
  const loading = useAppStore((state) => state.loading)
  const refreshRepo = useAppStore((state) => state.refreshRepo)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const fetchRepo = useAppStore((state) => state.fetchRepo)
  const pullRepo = useAppStore((state) => state.pullRepo)
  const pushRepo = useAppStore((state) => state.pushRepo)
  const stageFiles = useAppStore((state) => state.stageFiles)
  const unstageFiles = useAppStore((state) => state.unstageFiles)
  const discardFiles = useAppStore((state) => state.discardFiles)
  const commit = useAppStore((state) => state.commit)
  const stashPush = useAppStore((state) => state.stashPush)
  const stashAction = useAppStore((state) => state.stashAction)
  const createBranch = useAppStore((state) => state.createBranch)
  const switchBranch = useAppStore((state) => state.switchBranch)
  const deleteBranch = useAppStore((state) => state.deleteBranch)
  const checkoutTarget = useAppStore((state) => state.checkoutTarget)
  const resolveConflict = useAppStore((state) => state.resolveConflict)
  const switchAccount = useAppStore((state) => state.switchAccount)
  const inspectorOpen = useAppStore((state) => state.inspectorOpen)
  const toggleInspector = useAppStore((state) => state.toggleInspector)
  const setInspectorFocus = useAppStore((state) => state.setInspectorFocus)
  const setInspectorTab = useAppStore((state) => state.setInspectorTab)
  const selectedWorkFile = useAppStore((state) => state.selectedWorkFile)
  const setSelectedWorkFile = useAppStore((state) => state.setSelectedWorkFile)
  const lockIssue = useAppStore((state) => state.lockIssue)
  const clearLockAndRetry = useAppStore((state) => state.clearLockAndRetry)
  const dismissLock = useAppStore((state) => state.dismissLock)

  const repo = repos.find((item) => item.path === selectedRepoPath)
  const accounts = config?.accounts ?? []
  const [leftTab, setLeftTab] = useState<'branches' | 'stashes' | 'account'>('branches')
  const [changesOverride, setChangesOverride] = useState<boolean | null>(null)
  const [changesHeight, setChangesHeight] = useState(248)
  const changesDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [resizingChanges, setResizingChanges] = useState(false)
  const [branchDialog, setBranchDialog] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchBase, setNewBranchBase] = useState('')
  const [newBranchSwitch, setNewBranchSwitch] = useState(true)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitAndPush, setCommitAndPush] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [stashUntracked, setStashUntracked] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [diffTarget, setDiffTarget] = useState<{ file: StatusFile; mode: 'unstaged' | 'staged' } | null>(null)
  const [stashDiff, setStashDiff] = useState<number | null>(null)
  const [selectedUnstaged, setSelectedUnstaged] = useState<Set<string>>(new Set())
  const [selectedStaged, setSelectedStaged] = useState<Set<string>>(new Set())
  const [accountId, setAccountId] = useState('')
  const [protocol, setProtocol] = useState<'https' | 'ssh'>('https')

  const [inspectedBranch, setInspectedBranch] = useState<Branch | null>(null)
  const [branchNodes, setBranchNodes] = useState<HistoryRow[]>([])
  const [branchNodesLoading, setBranchNodesLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  useEffect(() => {
    if (!selectedRepoPath) return
    refreshRepo()
  }, [refreshRepo, selectedRepoPath])

  useEffect(() => {
    setInspectedBranch(null)
    setBranchNodes([])
    setDiffTarget(null)
    setStashDiff(null)
    setContextMenu(null)
    setChangesOverride(null)
    setSelectedUnstaged(new Set())
    setSelectedStaged(new Set())
  }, [selectedRepoPath])

  useEffect(() => {
    if (!resizingChanges) return
    const onMove = (event: MouseEvent) => {
      if (!changesDragRef.current) return
      const next = changesDragRef.current.startHeight + (event.clientY - changesDragRef.current.startY)
      setChangesHeight(Math.max(168, Math.min(520, Math.round(next))))
    }
    const onUp = () => {
      changesDragRef.current = null
      setResizingChanges(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizingChanges])

  useEffect(() => {
    const statusFiles = status?.files ?? []
    const availableUnstaged = new Set(
      statusFiles
        .filter((file) => (file.unstaged || file.untracked) && !file.conflicted)
        .map((file) => file.path)
    )
    const availableStaged = new Set(
      statusFiles.filter((file) => file.staged && !file.conflicted).map((file) => file.path)
    )
    setSelectedUnstaged((previous) => new Set([...previous].filter((path) => availableUnstaged.has(path))))
    setSelectedStaged((previous) => new Set([...previous].filter((path) => availableStaged.has(path))))
  }, [status])

  useEffect(() => {
    if (!repo) return
    const matched =
      repo.accountId ||
      config?.accounts.find((account) => account.isDefault)?.id ||
      config?.accounts[0]?.id ||
      ''
    setAccountId(matched)
    setProtocol(repo.protocol === 'ssh' ? 'ssh' : 'https')
  }, [repo?.accountId, repo?.protocol, config?.accounts])

  const loadBranchNodes = useCallback(
    async (branch: Branch) => {
      if (!selectedRepoPath) return
      setBranchNodesLoading(true)
      try {
        const limit = config?.settings.historyLimit ?? 2000
        const result = await window.api.invoke<HistoryResult>('repo.history', {
          path: selectedRepoPath,
          filter: branch.refName || branch.shortName,
          limit
        })
        setBranchNodes(result.rows ?? [])
      } catch (error) {
        useAppStore
          .getState()
          .toast('error', '读取分支节点失败', error instanceof Error ? error.message : String(error))
      } finally {
        setBranchNodesLoading(false)
      }
    },
    [config?.settings.historyLimit, selectedRepoPath]
  )

  const inspectBranch = useCallback(
    (branch: Branch) => {
      if (inspectedBranch?.refName === branch.refName) {
        setInspectedBranch(null)
        return
      }
      setInspectedBranch(branch)
      loadBranchNodes(branch)
    },
    [inspectedBranch?.refName, loadBranchNodes]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleInspector()
        return
      }
      if (inspectedBranch && event.key === 'Escape' && !contextMenu) setInspectedBranch(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [contextMenu, inspectedBranch, toggleInspector])

  const localBranches = useMemo(() => branches.filter((branch) => branch.type === 'local'), [branches])
  const remoteBranches = useMemo(() => branches.filter((branch) => branch.type === 'remote'), [branches])
  const currentAccount = accounts.find((account) => account.id === (repo?.accountId || accountId))
  const previewAccount = accounts.find((account) => account.id === accountId)
  const previewOwner = repo?.owner ?? ''
  const previewRepo = repo?.repo ?? ''
  const previewUrl =
    previewAccount && previewOwner && previewRepo
      ? protocol === 'ssh'
        ? `git@${previewAccount.sshHost || 'github.com'}:${previewOwner}/${previewRepo}.git`
        : previewAccount.httpsUser
          ? `https://${previewAccount.httpsUser}@github.com/${previewOwner}/${previewRepo}.git`
          : `https://github.com/${previewOwner}/${previewRepo}.git`
      : ''

  if (!repo) {
    const scanning = Boolean(loading.scan || loading.bootstrap)
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Card>
          <EmptyState
            icon={scanning ? <Spinner /> : <GitBranch className="h-5 w-5" />}
            title={scanning ? '正在扫描仓库…' : '未选择仓库'}
            description={
              scanning
                ? '扫描完成后会自动选择第一个仓库，请稍候。'
                : '请先在仓库页扫描或选择一个仓库。'
            }
            action={
              <Button variant="primary" onClick={() => setActivePage('repos')}>
                {scanning ? '查看扫描进度' : '选择仓库'}
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const files = status?.files ?? []
  const staged = files.filter((file) => file.staged && !file.conflicted)
  const unstaged = files.filter((file) => (file.unstaged || file.untracked) && !file.conflicted)
  const conflicted = files.filter((file) => file.conflicted)
  const branchLabel = status
    ? status.branch || 'detached'
    : repo.detached
      ? 'detached'
      : repo.branch || 'detached'

  const startCreateBranch = (baseOverride?: string) => {
    setNewBranchName('')
    setNewBranchBase(baseOverride ?? (status?.branch || repo.branch || ''))
    setNewBranchSwitch(true)
    setBranchDialog(true)
  }

  const submitBranch = async () => {
    if (!newBranchName.trim()) {
      useAppStore.getState().toast('error', '分支名不能为空')
      return
    }
    const ok = await createBranch(newBranchName.trim(), newBranchBase, newBranchSwitch)
    if (ok) {
      setBranchDialog(false)
      if (inspectedBranch) loadBranchNodes(inspectedBranch)
    }
  }

  const submitCommit = async () => {
    const ok = await commit(commitMessage)
    if (!ok) return
    setCommitMessage('')
    if (commitAndPush) await pushRepo()
    if (inspectedBranch) loadBranchNodes(inspectedBranch)
  }

  const handleCheckoutNode = async (hash: string) => {
    const ok = await checkoutTarget(hash)
    if (ok && inspectedBranch) loadBranchNodes(inspectedBranch)
  }

  const handleSwitchBranch = async (name: string) => {
    const ok = await switchBranch(name)
    if (ok && inspectedBranch) loadBranchNodes(inspectedBranch)
    return ok
  }

  const requestDiscard = (file: StatusFile) => {
    setConfirm({
      title: '丢弃修改',
      description: `确定丢弃「${file.displayPath}」的本地修改吗？此操作不可恢复。`,
      confirmLabel: '丢弃',
      danger: true,
      action: () => discardFiles([{ path: file.path, untracked: file.untracked }])
    })
  }

  const requestDeleteBranch = (branch: Branch) => {
    setConfirm({
      title: '删除分支',
      description: `确定删除本地分支「${branch.shortName}」吗？`,
      confirmLabel: '删除',
      danger: true,
      action: async () => {
        const ok = await deleteBranch(branch.shortName, false)
        if (ok && inspectedBranch?.refName === branch.refName) setInspectedBranch(null)
      }
    })
  }

  const openBranchContextMenu = (branch: Branch, event: React.MouseEvent) => {
    event.preventDefault()
    const items: ContextMenuItem[] = [
      {
        label: inspectedBranch?.refName === branch.refName ? '收起分支节点' : '查看分支节点',
        icon: <GitCommitHorizontal className="h-3.5 w-3.5" />,
        onSelect: () => inspectBranch(branch)
      }
    ]
    if (!branch.isCurrent) {
      items.push({
        label: `切换到 ${branch.shortName}`,
        icon: <GitBranch className="h-3.5 w-3.5" />,
        onSelect: () => handleSwitchBranch(branch.shortName)
      })
    }
    items.push({
      label: '从此分支新建…',
      icon: <GitBranchPlus className="h-3.5 w-3.5" />,
      onSelect: () => startCreateBranch(branch.shortName)
    })
    if (branch.type === 'local' && !branch.isCurrent) {
      items.push({
        label: '删除分支',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => requestDeleteBranch(branch)
      })
    }
    setContextMenu({ x: event.clientX, y: event.clientY, items })
  }

  const openNodeContextMenu = (row: HistoryRow, event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: `签出到此节点 (${row.hash})`,
          icon: <RotateCcw className="h-3.5 w-3.5" />,
          onSelect: () => handleCheckoutNode(row.hash)
        },
        {
          label: '从此节点新建分支…',
          icon: <GitBranchPlus className="h-3.5 w-3.5" />,
          onSelect: () => startCreateBranch(row.hash)
        },
        {
          label: '复制提交哈希',
          icon: <Copy className="h-3.5 w-3.5" />,
          onSelect: () => copyText(row.hash)
        }
      ]
    })
  }

  const toggleUnstaged = (path: string) => {
    setSelectedUnstaged((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleStaged = (path: string) => {
    setSelectedStaged((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const stageSelected = async () => {
    if (selectedUnstaged.size === 0) return
    await stageFiles([...selectedUnstaged])
    setSelectedUnstaged(new Set())
  }

  const unstageSelected = async () => {
    if (selectedStaged.size === 0) return
    await unstageFiles([...selectedStaged])
    setSelectedStaged(new Set())
  }

  const renderFileGroup = (
    title: string,
    list: StatusFile[],
    mode: 'unstaged' | 'staged',
    selected: Set<string>,
    onToggle: (path: string) => void,
    onToggleAll: () => void,
    action?: { label: string; disabled: boolean; onClick: () => void },
    selectable = true
  ) => (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-y border-[var(--border)] bg-[var(--panel-soft)] px-4 py-1.5">
        <label className="flex min-w-0 cursor-pointer items-center gap-2">
          {selectable ? (
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--accent)]"
              checked={list.length > 0 && selected.size === list.length}
              onChange={onToggleAll}
              disabled={list.length === 0 || loading.mutation}
              aria-label={`全选${title}`}
            />
          ) : null}
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {title}
          </span>
          <span className="text-[10px] tabular-nums text-[var(--faint)]">{list.length}</span>
        </label>
        {action ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-2 text-[10px]"
            disabled={action.disabled || loading.mutation}
            onClick={action.onClick}
          >
            {action.label}
            {selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        ) : null}
      </div>
      {list.length === 0 ? (
        <div className="px-4 py-3 text-[11px] text-[var(--faint)]">暂无{title}改动</div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {list.map((file) => (
            <FileRow
              key={`${mode}:${file.xy}:${file.path}`}
              file={file}
              active={selectedWorkFile?.path === file.path && selectedWorkFile?.mode === mode}
              selected={selected.has(file.path)}
              onSelect={() => {
                setSelectedWorkFile({ path: file.path, mode })
                setInspectorFocus('working')
                if (inspectorOpen) setInspectorTab('changes')
              }}
              onSelectedChange={() => onToggle(file.path)}
              selectable={selectable}
              onOpenDiff={() => setDiffTarget({ file, mode })}
              onDiscard={() => requestDiscard(file)}
              onResolve={(side) => resolveConflict(file.path, side)}
              disabled={loading.mutation}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--border)] bg-[var(--panel-solid)]/70 px-5 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-[188px]">
            <Select
              value={selectedRepoPath}
              onChange={(event) => selectRepo(event.target.value)}
              aria-label="切换仓库"
              className="h-8 font-semibold text-[var(--text-strong)]"
            >
              {repos.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <Badge variant={branchLabel === 'detached' ? 'warning' : 'outline'}>
            <GitBranch className="h-3 w-3" />
            {branchLabel}
          </Badge>
          {status?.upstream ? <Badge variant="muted">↑ {status.upstream}</Badge> : null}
          {status && status.ahead > 0 ? (
            <Badge variant="success">
              <ArrowUp className="h-3 w-3" /> {status.ahead}
            </Badge>
          ) : null}
          {status && status.behind > 0 ? (
            <Badge variant="warning">
              <ArrowDown className="h-3 w-3" /> {status.behind}
            </Badge>
          ) : null}
          <span className="code-font hidden text-xs text-[var(--faint)] min-[1280px]:inline" title={repo.path}>
            {shortPath(repo.path, 48)}
          </span>
          {currentAccount ? (
            <span className="hidden items-center gap-1 text-xs text-[var(--muted)] lg:inline-flex">
              <UserRound className="h-3 w-3" /> {currentAccount.name}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="secondary" size="sm" loading={loading.mutation} onClick={fetchRepo}>
            <Download className="h-3.5 w-3.5" /> Fetch
          </Button>
          <Button variant="secondary" size="sm" loading={loading.mutation} onClick={pullRepo}>
            <ArrowDown className="h-3.5 w-3.5" /> 拉取
          </Button>
          <Button variant="primary" size="sm" loading={loading.mutation} onClick={pushRepo}>
            <Upload className="h-3.5 w-3.5" /> 推送
          </Button>
          <Tooltip content="刷新">
            <Button
              variant="ghost"
              size="icon"
              loading={loading.repo || loading.history}
              onClick={async () => {
                await refreshRepo({ history: true })
                if (inspectedBranch) loadBranchNodes(inspectedBranch)
              }}
            >
              {!(loading.repo || loading.history) ? <RefreshCw className="h-3.5 w-3.5" /> : null}
            </Button>
          </Tooltip>
          <Tooltip content="编辑器">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.api.openEditor(repo.path, config?.settings.editor)}
            >
              <Code2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="终端">
            <Button variant="ghost" size="icon" onClick={() => window.api.openTerminal(repo.path)}>
              <Terminal className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="打开文件夹">
            <Button variant="ghost" size="icon" onClick={() => window.api.openPath(repo.path)}>
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <Tooltip content={inspectorOpen ? '收起右侧面板 (Ctrl+Shift+B)' : '展开右侧面板 (Ctrl+Shift+B)'}>
            <Button
              variant={inspectorOpen ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="切换右侧面板"
              aria-pressed={inspectorOpen}
              onClick={toggleInspector}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto xl:overflow-hidden">
          <div className="flex w-full flex-1 flex-col p-4 xl:min-h-0">

        {status?.hasConflicts ? (
          <div className="mb-4 flex shrink-0 items-center gap-2.5 rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">存在合并冲突，请在文件列表中选择保留版本。</span>
          </div>
        ) : null}

        {repo.identityMismatch ? (
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2.5 rounded-md border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3.5 py-2.5 text-xs text-[var(--warning)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">本地提交身份与仓库绑定账号不一致</div>
              <div className="mt-0.5 text-[11px] opacity-90">
                本地：{repo.userName || '未设置'} &lt;{repo.userEmail || '未设置'}&gt;
                {' · '}仓库账号：{repo.accountName || '未匹配'}
              </div>
            </div>
            {repo.accountId ? (
              <Button
                size="sm"
                variant="secondary"
                loading={loading.mutation}
                onClick={() => switchAccount(repo.accountId, protocol)}
              >
                使用账号身份
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="relative grid grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[224px_minmax(0,1fr)]">
          <Card className="flex min-h-[260px] flex-col xl:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[var(--border)] px-2 py-1.5">
              <div className="inline-flex min-w-0 flex-1 items-center rounded-md bg-[var(--panel-soft)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setLeftTab('branches')}
                  className={cn(
                    'focus-ring inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 font-medium transition-colors',
                    leftTab === 'branches'
                      ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  )}
                >
                  <span>分支</span>
                  <span className="text-[10px] tabular-nums text-[var(--faint)]">{localBranches.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('stashes')}
                  className={cn(
                    'focus-ring inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 font-medium transition-colors',
                    leftTab === 'stashes'
                      ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  )}
                >
                  <span>Stash</span>
                  {stashes.length > 0 ? (
                    <span className="text-[10px] tabular-nums text-[var(--faint)]">{stashes.length}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('account')}
                  className={cn(
                    'focus-ring inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 font-medium transition-colors',
                    leftTab === 'account'
                      ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  )}
                >
                  <span>账户</span>
                  {repo.identityMismatch ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                  ) : null}
                </button>
              </div>
              {leftTab === 'branches' ? (
                <Tooltip content="新建分支">
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startCreateBranch()}>
                    <GitBranchPlus className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              ) : null}
            </div>

            {leftTab === 'branches' ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <BranchGroup
                  title="本地"
                  branches={localBranches}
                  inspectedRef={inspectedBranch?.refName}
                  onInspect={inspectBranch}
                  onSwitch={handleSwitchBranch}
                  onContextMenu={openBranchContextMenu}
                  onDelete={requestDeleteBranch}
                />
                <BranchGroup
                  title="远程"
                  branches={remoteBranches}
                  inspectedRef={inspectedBranch?.refName}
                  onInspect={inspectBranch}
                  onSwitch={handleSwitchBranch}
                  onContextMenu={openBranchContextMenu}
                />
                {branches.length === 0 ? (
                  <div className="flex items-center justify-center py-10">
                    <Spinner />
                  </div>
                ) : null}
              </div>
            ) : leftTab === 'stashes' ? (
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <div className="shrink-0 space-y-2.5">
                  <Input
                    value={stashMessage}
                    onChange={(event) => setStashMessage(event.target.value)}
                    placeholder="Stash 说明（可选）"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
                      <Switch checked={stashUntracked} onCheckedChange={setStashUntracked} />
                      包含未跟踪
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={loading.mutation}
                      onClick={async () => {
                        await stashPush(stashMessage || 'Stash', stashUntracked)
                        setStashMessage('')
                        setStashUntracked(false)
                      }}
                    >
                      <Archive className="h-3.5 w-3.5" /> 保存
                    </Button>
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                  {stashes.length === 0 ? (
                    <div className="flex h-full min-h-[84px] items-center justify-center rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--faint)]">
                      暂无 Stash
                    </div>
                  ) : (
                    stashes.map((stash) => (
                      <div
                        key={stash.ref}
                        className="group flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-[var(--text)]" title={stash.message}>
                            {stash.message}
                          </div>
                          <div className="text-[11px] text-[var(--faint)]">{stash.date}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Tooltip content="查看内容">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setStashDiff(stash.index)}>
                              <FileDiff className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                          <Tooltip content="应用">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => stashAction('apply', stash.index)}>
                              <Play className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                          <Tooltip content="弹出">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => stashAction('pop', stash.index)}>
                              <ArchiveRestore className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                          <Tooltip content="删除">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-[var(--faint)] hover:text-[var(--danger)]"
                              onClick={() =>
                                setConfirm({
                                  title: '删除 Stash',
                                  description: `确定删除「${stash.message}」吗？`,
                                  confirmLabel: '删除',
                                  danger: true,
                                  action: () => stashAction('drop', stash.index)
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
                <Field label="账号">
                  <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                    <option value="">选择账号</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="协议">
                  <Select value={protocol} onChange={(event) => setProtocol(event.target.value as 'https' | 'ssh')}>
                    <option value="https">HTTPS</option>
                    <option value="ssh">SSH</option>
                  </Select>
                </Field>
                {previewUrl ? (
                  <div
                    className="code-font break-all rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-[11px] leading-4 text-[var(--muted)]"
                    title={previewUrl}
                  >
                    {previewUrl}
                  </div>
                ) : null}
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={loading.mutation}
                  disabled={!accountId}
                  onClick={() => switchAccount(accountId, protocol)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  应用到当前仓库
                </Button>
              </div>
            )}
          </Card>

          {inspectedBranch ? (
            <BranchNodesPanel
              branch={inspectedBranch}
              rows={branchNodes}
              loading={branchNodesLoading}
              onClose={() => setInspectedBranch(null)}
              onSwitchBranch={() => handleSwitchBranch(inspectedBranch.shortName)}
              onNodeContextMenu={openNodeContextMenu}
            />
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!(changesOverride ?? files.length > 0) ? (
              <Card className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="flex items-center gap-2.5">
                  {files.length === 0 ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="inline-flex h-2 w-2 rounded-full bg-[var(--warning)]" />
                  )}
                  <span className="text-xs font-semibold text-[var(--text-strong)]">
                    {files.length === 0 ? '工作区干净' : `工作区变更 (${files.length})`}
                  </span>
                  <span className="text-xs tabular-nums text-[var(--faint)]">
                    已暂存 {staged.length} · 未暂存 {unstaged.length}
                    {conflicted.length > 0 ? ` · 冲突 ${conflicted.length}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {files.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => stageFiles()}
                      disabled={loading.mutation}
                    >
                      <Check className="h-3.5 w-3.5" /> 全部暂存
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setChangesOverride(true)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    {files.length === 0 ? '展开提交区' : '展开变更'}
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                <Card
                  style={{ height: changesHeight }}
                  className="flex shrink-0 flex-col xl:min-h-[168px]"
                >
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[13px] font-semibold text-[var(--text-strong)]">变更</span>
                      <span className="text-xs tabular-nums text-[var(--muted)]">
                        已暂存 {staged.length} · 未暂存 {unstaged.length}
                        {conflicted.length > 0 ? ` · 冲突 ${conflicted.length}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => stageFiles()} disabled={files.length === 0 || loading.mutation}>
                        <Check className="h-3.5 w-3.5" /> 全部暂存
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => unstageFiles()} disabled={staged.length === 0 || loading.mutation}>
                        <Undo2 className="h-3.5 w-3.5" /> 全部取消
                      </Button>
                      <Tooltip content={changesHeight >= 380 ? '还原高度' : '加高变更区'}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setChangesHeight(changesHeight >= 380 ? 248 : 420)}
                        >
                          {changesHeight >= 380 ? (
                            <Minimize2 className="h-3.5 w-3.5" />
                          ) : (
                            <Maximize2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </Tooltip>
                      <Tooltip content="收起变更区">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setChangesOverride(false)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[var(--border)] md:grid-cols-[minmax(0,1fr)_248px] md:divide-x md:divide-y-0">
                    <div className="min-h-0 overflow-y-auto">
                      {files.length === 0 ? (
                        <EmptyState
                          icon={<Check className="h-5 w-5" />}
                          title="工作区干净"
                          className="h-full min-h-[110px]"
                        />
                      ) : (
                        <div>
                          {conflicted.length > 0
                            ? renderFileGroup('冲突', conflicted, 'unstaged', new Set(), () => {}, () => {}, undefined, false)
                            : null}
                          {renderFileGroup(
                            '未暂存',
                            unstaged,
                            'unstaged',
                            selectedUnstaged,
                            toggleUnstaged,
                            () =>
                              setSelectedUnstaged((previous) =>
                                previous.size === unstaged.length
                                  ? new Set()
                                  : new Set(unstaged.map((file) => file.path))
                              ),
                            {
                              label: '暂存选中',
                              disabled: selectedUnstaged.size === 0,
                              onClick: stageSelected
                            }
                          )}
                          {renderFileGroup(
                            '已暂存',
                            staged,
                            'staged',
                            selectedStaged,
                            toggleStaged,
                            () =>
                              setSelectedStaged((previous) =>
                                previous.size === staged.length
                                  ? new Set()
                                  : new Set(staged.map((file) => file.path))
                              ),
                            {
                              label: '取消暂存选中',
                              disabled: selectedStaged.size === 0,
                              onClick: unstageSelected
                            }
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex min-h-0 flex-col justify-between gap-2 p-3">
                      <Textarea
                        value={commitMessage}
                        onChange={(event) => setCommitMessage(event.target.value)}
                        placeholder="提交说明（Ctrl + Enter 提交）"
                        className="min-h-[68px] flex-1 resize-none"
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                            event.preventDefault()
                            submitCommit()
                          }
                        }}
                      />
                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
                          <Switch checked={commitAndPush} onCheckedChange={setCommitAndPush} />
                          提交后推送
                        </label>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={loading.mutation}
                          disabled={!commitMessage.trim() || staged.length === 0}
                          onClick={submitCommit}
                        >
                          <GitCommitHorizontal className="h-3.5 w-3.5" />
                          提交{staged.length > 0 ? ` (${staged.length})` : ''}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="调整变更与提交历史高度比例"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    changesDragRef.current = { startY: event.clientY, startHeight: changesHeight }
                    setResizingChanges(true)
                  }}
                  className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center"
                >
                  <span
                    className={cn(
                      'h-1 w-12 rounded-full transition-colors',
                      resizingChanges ? 'bg-[var(--accent)]' : 'bg-[var(--border)] group-hover:bg-[var(--accent)]/60'
                    )}
                  />
                </div>
              </>
            )}

            <HistoryView />
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(lockIssue)}
        onOpenChange={(open) => {
          if (!open) dismissLock()
        }}
        title="Git 锁未释放"
        description="本次 Git 操作被仓库的 index.lock 阻止，已自动等待并重试。"
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={dismissLock}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={loading.mutation}
              disabled={Boolean(lockIssue?.held) || lockIssue?.writable === false}
              onClick={clearLockAndRetry}
            >
              清理 index.lock 并重试
            </Button>
          </>
        }
      >
        {lockIssue ? (
          <div className="space-y-2.5 text-xs">
            <div className="code-font break-all rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-[11px] text-[var(--muted)]">
              {lockIssue.path || '未找到 .git/index.lock'}
            </div>
            {lockIssue.exists ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[var(--border)] px-3 py-2">
                  <div className="text-[var(--faint)]">锁文件存在时间</div>
                  <div className="mt-0.5 font-medium text-[var(--text)]">
                    {Math.max(0, Math.round(lockIssue.ageMs / 1000))} 秒
                  </div>
                </div>
                <div className="rounded-md border border-[var(--border)] px-3 py-2">
                  <div className="text-[var(--faint)]">活跃 git 进程</div>
                  <div className="mt-0.5 font-medium text-[var(--text)]">{lockIssue.activeGit} 个</div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-[var(--warning)]">
                锁文件不存在，但 Git 仍无法创建它。通常是 .git 目录只读、权限不足，或安全软件拦截写入。
              </div>
            )}
            {lockIssue.held ? (
              <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">
                另一个 Git 操作仍持有锁，暂不能清理。请等待 Cursor / PyCharm 的 Git 操作结束后再试。
              </div>
            ) : lockIssue.exists ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-[var(--muted)]">
                当前没有 Git 进程持有该锁，可以安全地把它移到 `.git/index.lock.stale-*` 备份后重试。
              </div>
            ) : null}
            {lockIssue.writable === false ? (
              <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">
                无法在 .git 目录创建文件。请检查目录只读属性、ACL 权限，或安全软件是否拦截了写入。
                {lockIssue.writeError ? `（Win32 错误 ${lockIssue.writeError}）` : ''}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={stashDiff !== null}
        onOpenChange={(open) => {
          if (!open) setStashDiff(null)
        }}
        title={stashDiff !== null ? `Stash · stash@{${stashDiff}}` : 'Stash'}
        description="查看该 Stash 中缓存的改动。"
        width="max-w-[min(1240px,96vw)]"
      >
        {stashDiff !== null ? <DiffView repoPath={repo.path} stash={stashDiff} /> : null}
      </Dialog>

      <Dialog
        open={Boolean(diffTarget)}
        onOpenChange={(open) => {
          if (!open) setDiffTarget(null)
        }}
        title={diffTarget ? `Diff · ${diffTarget.file.displayPath}` : 'Diff'}
        description={diffTarget ? '查看改动，或只暂存其中一段。' : undefined}
        width="max-w-[min(1240px,96vw)]"
      >
        {diffTarget ? (
          <DiffView
            repoPath={repo.path}
            file={diffTarget.file.path}
            initialMode={diffTarget.mode}
            unstagedAvailable={diffTarget.file.unstaged || diffTarget.file.untracked}
            stagedAvailable={diffTarget.file.staged}
            onChanged={async () => {
              await refreshRepo()
            }}
          />
        ) : null}
      </Dialog>

      <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />

      <Dialog
        open={branchDialog}
        onOpenChange={setBranchDialog}
        title="新建分支"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBranchDialog(false)}>
              取消
            </Button>
            <Button variant="primary" loading={loading.mutation} onClick={submitBranch}>
              创建
            </Button>
          </>
        }
      >
        <Field label="分支名">
          <Input
            value={newBranchName}
            onChange={(event) => setNewBranchName(event.target.value)}
            placeholder="feature/example"
            className="code-font"
            autoFocus
          />
        </Field>
        <Field label="基于">
          <Input
            value={newBranchBase}
            onChange={(event) => setNewBranchBase(event.target.value)}
            placeholder="当前 HEAD"
            className="code-font"
          />
        </Field>
        <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5">
          <span className="text-xs font-medium text-[var(--text)]">创建后立即切换</span>
          <Switch checked={newBranchSwitch} onCheckedChange={setNewBranchSwitch} />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              取消
            </Button>
            <Button
              variant={confirm?.danger ? 'danger' : 'primary'}
              onClick={async () => {
                const action = confirm?.action
                setConfirm(null)
                if (action) await action()
              }}
            >
              {confirm?.confirmLabel ?? '确定'}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
      </div>

      {inspectorOpen ? (
        <SideInspectorPanel
          onCreateBranchFromCommit={(hash) => startCreateBranch(hash)}
          onOpenFileModal={(file, mode) => setDiffTarget({ file, mode })}
        />
      ) : null}
      </div>
    </div>
  )
}

function BranchGroup({
  title,
  branches,
  inspectedRef,
  onInspect,
  onSwitch,
  onContextMenu,
  onDelete
}: {
  title: string
  branches: Branch[]
  inspectedRef?: string
  onInspect: (branch: Branch) => void
  onSwitch: (name: string) => Promise<boolean>
  onContextMenu: (branch: Branch, event: React.MouseEvent) => void
  onDelete?: (branch: Branch) => void
}) {
  if (branches.length === 0) return null
  return (
    <div className="mb-2">
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-[var(--faint)]">{title}</div>
      <div className="space-y-0.5">
        {branches.map((branch) => {
          const inspected = inspectedRef === branch.refName
          return (
            <div
              key={branch.refName}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                inspected
                  ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-strong)]'
                  : branch.isCurrent
                    ? 'bg-[var(--panel-soft)] font-medium text-[var(--text-strong)]'
                    : 'text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
              )}
              onClick={() => onInspect(branch)}
              onDoubleClick={() => onSwitch(branch.shortName)}
              onContextMenu={(event) => onContextMenu(branch, event)}
            >
              {branch.isCurrent ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              ) : (
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
              )}
              <span className="min-w-0 flex-1 truncate" title={branch.shortName}>
                {branch.shortName}
              </span>
              {onDelete && !branch.isCurrent ? (
                <button
                  className="rounded p-0.5 text-[var(--faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(branch)
                  }}
                  title="删除分支"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-opacity',
                  inspected
                    ? 'text-[var(--accent)] opacity-100'
                    : 'text-[var(--faint)] opacity-0 group-hover:opacity-100'
                )}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BranchNodesPanel({
  branch,
  rows,
  loading,
  onClose,
  onSwitchBranch,
  onNodeContextMenu
}: {
  branch: Branch
  rows: HistoryRow[]
  loading: boolean
  onClose: () => void
  onSwitchBranch: () => void
  onNodeContextMenu: (row: HistoryRow, event: React.MouseEvent) => void
}) {
  return (
    <Card
      style={{ boxShadow: 'var(--shadow-lg)' }}
      className="flex min-h-[320px] max-h-[460px] flex-col border-[var(--border-strong)] bg-[var(--panel-solid)] xl:absolute xl:bottom-0 xl:left-[236px] xl:top-0 xl:z-20 xl:max-h-none xl:w-[356px]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span className="truncate text-[13px] font-semibold text-[var(--text-strong)]" title={branch.shortName}>
            {branch.shortName}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-[var(--faint)]">{rows.length}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!branch.isCurrent ? (
            <Button size="sm" variant="secondary" onClick={onSwitchBranch}>
              切换分支
            </Button>
          ) : (
            <Badge variant="accent">当前</Badge>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="关闭">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<GitCommitHorizontal className="h-5 w-5" />} title="暂无节点" className="py-12" />
        ) : (
          rows.map((row, index) => {
            const chips = parseDecorations(row.decorations)
            const isHead = row.decorations.includes('HEAD')
            const isFirst = index === 0
            const isLast = index === rows.length - 1
            return (
              <div
                key={row.hash}
                onContextMenu={(event) => onNodeContextMenu(row, event)}
                className={cn(
                  'group relative flex cursor-default items-stretch gap-3 px-3.5 py-2 transition-colors hover:bg-[var(--panel-soft)]',
                  isHead && 'bg-[var(--accent-soft)]/50'
                )}
              >
                <div className="relative flex w-4 shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      'w-[1.5px] flex-1',
                      isFirst ? 'bg-transparent' : 'bg-[var(--border-strong)]'
                    )}
                  />
                  <span
                    className={cn(
                      'my-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2',
                      isHead
                        ? 'border-[var(--accent)] bg-[var(--accent)] ring-2 ring-[var(--accent-border)]'
                        : 'border-[var(--accent)] bg-[var(--panel-solid)]'
                    )}
                  />
                  <span
                    className={cn(
                      'w-[1.5px] flex-1',
                      isLast ? 'bg-transparent' : 'bg-[var(--border-strong)]'
                    )}
                  />
                </div>

                <div className="min-w-0 flex-1 py-0.5">
                  <div className="truncate text-xs font-medium text-[var(--text-strong)]" title={row.subject}>
                    {row.subject || '(无提交说明)'}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--faint)]">
                    <span className="code-font text-[var(--muted)]">{row.hash}</span>
                    <span>·</span>
                    <span className="truncate">{row.author}</span>
                    <span>·</span>
                    <span className="tabular-nums">{row.date}</span>
                  </div>
                  {chips.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {chips.slice(0, 4).map((chip, chipIndex) => (
                        <span
                          key={`${chip.text}-${chipIndex}`}
                          className={cn(
                            'max-w-[140px] truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-3',
                            chip.kind === 'head' && 'border-transparent bg-[var(--text-strong)] text-[var(--bg)]',
                            chip.kind === 'tag' && 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]',
                            chip.kind === 'remote' && 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]',
                            chip.kind === 'branch' && 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          )}
                        >
                          {chip.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

function FileRow({
  file,
  active = false,
  selected,
  onSelect,
  onSelectedChange,
  selectable = true,
  onOpenDiff,
  onDiscard,
  onResolve,
  disabled = false
}: {
  file: StatusFile
  active?: boolean
  selected: boolean
  onSelect: () => void
  onSelectedChange: () => void
  selectable?: boolean
  onOpenDiff: () => void
  onDiscard: () => void
  onResolve: (side: 'ours' | 'theirs') => void
  disabled?: boolean
}) {
  const variant = file.conflicted
    ? 'danger'
    : file.untracked
      ? 'accent'
      : file.staged && !file.unstaged
        ? 'success'
        : 'warning'
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-2.5 px-4 py-2 transition-colors',
        active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--panel-soft)]'
      )}
    >
      {selectable ? (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={onSelectedChange}
          disabled={disabled}
          aria-label={`选择 ${file.displayPath}`}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="code-font w-5 shrink-0 text-center text-[11px] font-semibold text-[var(--faint)]">
        {file.xy}
      </span>
      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-[var(--text)]" title={file.displayPath}>
          {file.displayPath}
        </div>
      </div>
      <Badge variant={variant}>{file.label}</Badge>
      <div
        className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <Tooltip content="查看 Diff">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpenDiff}>
            <FileDiff className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        {file.conflicted ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onResolve('ours')} disabled={disabled}>
              用我的
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onResolve('theirs')} disabled={disabled}>
              用对方的
            </Button>
          </>
        ) : !file.staged ? (
          <Tooltip content="丢弃修改">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-[var(--faint)] hover:text-[var(--danger)]"
              onClick={onDiscard}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}
