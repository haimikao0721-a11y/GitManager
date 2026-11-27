import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Github,
  History,
  Plus,
  RefreshCw,
  Search,
  Terminal
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { Account, RepoInfo } from '@/types/api'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  Tooltip
} from '@/components/ui'
import { basename, cn, shortPath } from '@/lib/utils'

export function ReposPage() {
  const repos = useAppStore((state) => state.repos)
  const config = useAppStore((state) => state.config)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const selectRepo = useAppStore((state) => state.selectRepo)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const loading = useAppStore((state) => state.loading)

  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [newOpen, setNewOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)

  const accounts = config?.accounts ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return repos.filter((repo) => {
      if (accountFilter !== 'all' && repo.accountId !== accountFilter) return false
      if (!q) return true
      return (
        repo.name.toLowerCase().includes(q) ||
        repo.path.toLowerCase().includes(q) ||
        repo.owner.toLowerCase().includes(q) ||
        repo.repo.toLowerCase().includes(q) ||
        repo.branch.toLowerCase().includes(q)
      )
    })
  }, [accountFilter, query, repos])

  const openRepo = async (repo: RepoInfo, tab: 'changes' | 'history') => {
    setWorkspaceTab(tab)
    await selectRepo(repo.path)
    setActivePage('workspace')
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">仓库</h1>
          {repos.length > 0 ? (
            <span className="text-xs text-[var(--muted)]">{repos.length} 个仓库</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setBatchOpen(true)} disabled={repos.length === 0}>
            <ArrowRightLeft className="h-3.5 w-3.5" />
            批量切换
          </Button>
          <Button variant="secondary" loading={loading.scan} onClick={() => scanRepos()}>
            <RefreshCw className="h-3.5 w-3.5" />
            扫描
          </Button>
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建仓库
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索仓库名、路径、owner 或分支…"
            className="pl-8"
          />
        </div>
        <div className="w-[200px]">
          <Select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">全部账号</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" onClick={() => setActivePage('settings')}>
          <FolderOpen className="h-3.5 w-3.5" />
          扫描目录
        </Button>
        {query || accountFilter !== 'all' ? (
          <span className="ml-auto text-xs tabular-nums text-[var(--muted)]">
            {filtered.length} / {repos.length}
          </span>
        ) : null}
      </div>

      {repos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderGit2 className="h-5 w-5" />}
            title={loading.scan ? '正在扫描仓库…' : '未发现仓库'}
            description="可在设置中添加包含 Git 项目的目录。"
            action={
              <div className="flex gap-2">
                <Button variant="primary" loading={loading.scan} onClick={() => scanRepos()}>
                  <RefreshCw className="h-3.5 w-3.5" /> 扫描
                </Button>
                <Button variant="secondary" onClick={() => setActivePage('settings')}>
                  扫描目录
                </Button>
              </div>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Search className="h-5 w-5" />} title="没有匹配的仓库" />
        </Card>
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {filtered.map((repo) => {
            const selected = repo.path === selectedRepoPath
            const account = accounts.find((item) => item.id === repo.accountId)
            return (
              <div
                key={repo.path}
                role="button"
                tabIndex={0}
                onClick={() => selectRepo(repo.path)}
                onDoubleClick={() => window.api.openPath(repo.path)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') selectRepo(repo.path)
                }}
                className={cn(
                  'group relative flex cursor-pointer flex-wrap items-center gap-4 px-4 py-3 transition-colors',
                  selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--panel-soft)]'
                )}
              >
                {selected ? (
                  <span className="pointer-events-none absolute inset-y-2 left-0 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-[var(--text-strong)]">
                      {repo.name}
                    </span>
                    <Badge variant={repo.branch ? 'outline' : 'warning'}>
                      <GitBranch className="h-3 w-3" />
                      {repo.detached ? 'detached' : repo.branch || '无分支'}
                    </Badge>
                    {account ? (
                      <Badge variant="accent">{account.name}</Badge>
                    ) : repo.isGitHub ? (
                      <Badge variant="muted">未匹配账号</Badge>
                    ) : null}
                    {repo.hasConflicts ? <Badge variant="danger">冲突</Badge> : null}
                    {repo.ahead > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-[var(--success)]">
                        <ArrowUp className="h-3 w-3" />
                        {repo.ahead}
                      </span>
                    ) : null}
                    {repo.behind > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-[var(--warning)]">
                        <ArrowDown className="h-3 w-3" />
                        {repo.behind}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--faint)]">
                    <span className="code-font truncate" title={repo.path}>
                      {shortPath(repo.path, 68)}
                    </span>
                    {repo.owner && repo.repo ? (
                      <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                        <Github className="h-3 w-3" />
                        {repo.owner}/{repo.repo}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="hidden min-w-[180px] max-w-[260px] flex-col items-end gap-0.5 md:flex">
                  {repo.lastCommitSubject ? (
                    <>
                      <div className="w-full truncate text-right text-xs text-[var(--text)]" title={repo.lastCommitSubject}>
                        {repo.lastCommitSubject}
                      </div>
                      <div className="text-[11px] tabular-nums text-[var(--faint)]">
                        {repo.lastCommitDate} · <span className="code-font">{repo.lastCommitHash}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--faint)]">无提交</span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation()
                      openRepo(repo, 'changes')
                    }}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    工作区
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation()
                      openRepo(repo, 'history')
                    }}
                  >
                    <History className="h-3.5 w-3.5" />
                    历史
                  </Button>
                  <Tooltip content="打开文件夹">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        window.api.openPath(repo.path)
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  <Tooltip content="终端">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        window.api.openTerminal(repo.path)
                      }}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  {repo.url ? (
                    <Tooltip content="在浏览器打开">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          const url = repo.url
                            .replace(/^git@([^:]+):/, 'https://$1/')
                            .replace(/\.git$/, '')
                          window.api.openExternal(url)
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  ) : null}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <BatchSwitchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        repos={repos}
        accounts={accounts}
      />
      <NewRepoDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}

function BatchSwitchDialog({
  open,
  onOpenChange,
  repos,
  accounts
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  repos: RepoInfo[]
  accounts: Account[]
}) {
  const switchAccounts = useAppStore((state) => state.switchAccounts)
  const loading = useAppStore((state) => state.loading)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [accountId, setAccountId] = useState('')
  const [protocol, setProtocol] = useState<'https' | 'ssh'>('https')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const defaultAccount = accounts.find((account) => account.isDefault) ?? accounts[0]
    setAccountId(defaultAccount?.id ?? '')
    setProtocol(defaultAccount?.authType ?? 'https')
    setSelected(new Set())
    setQuery('')
  }, [open, accounts])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return repos
    return repos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(text) ||
        repo.path.toLowerCase().includes(text) ||
        repo.owner.toLowerCase().includes(text) ||
        repo.accountName.toLowerCase().includes(text)
    )
  }, [query, repos])

  const toggle = (path: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectedCount = selected.size

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="批量切换账户"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={loading.mutation}
            disabled={selectedCount === 0 || !accountId}
            onClick={async () => {
              const result = await switchAccounts([...selected], accountId, protocol)
              if (result.failed === 0) onOpenChange(false)
            }}
          >
            切换 {selectedCount > 0 ? selectedCount : ''} 个仓库
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="目标账号">
          <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.length === 0 ? <option value="">没有账号</option> : null}
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选仓库…"
            className="pl-8"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelected(new Set(filtered.map((repo) => repo.path)))}
        >
          全选
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
          清空
        </Button>
        <span className="text-xs tabular-nums text-[var(--muted)]">
          已选 {selectedCount} / {repos.length}
        </span>
      </div>

      <div className="max-h-[320px] space-y-0.5 overflow-y-auto rounded-md border border-[var(--border)] p-1.5">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--faint)]">没有匹配的仓库</div>
        ) : (
          filtered.map((repo) => {
            const checked = selected.has(repo.path)
            return (
              <label
                key={repo.path}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 transition-colors',
                  checked ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--panel-soft)]'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(repo.path)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-[var(--text-strong)]">
                      {repo.name}
                    </span>
                    <Badge variant={repo.accountId ? 'accent' : 'muted'}>
                      {repo.accountName || '未匹配'}
                    </Badge>
                  </span>
                  <span className="code-font block truncate text-[11px] text-[var(--faint)]" title={repo.path}>
                    {repo.path}
                  </span>
                </span>
                {repo.owner && repo.repo ? (
                  <span className="hidden shrink-0 text-[11px] text-[var(--muted)] sm:block">
                    {repo.owner}/{repo.repo}
                  </span>
                ) : null}
              </label>
            )
          })
        )}
      </div>
    </Dialog>
  )
}

function NewRepoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const initRepo = useAppStore((state) => state.initRepo)
  const createGithubRepo = useAppStore((state) => state.createGithubRepo)
  const loading = useAppStore((state) => state.loading)
  const setActivePage = useAppStore((state) => state.setActivePage)

  const [localPath, setLocalPath] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [createOnGithub, setCreateOnGithub] = useState(false)
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [description, setDescription] = useState('')
  const [protocol, setProtocol] = useState<'https' | 'ssh'>('https')

  const reset = () => {
    setLocalPath('')
    setRemoteUrl('')
    setCreateOnGithub(false)
    setToken('')
    setName('')
    setIsPrivate(true)
    setDescription('')
    setProtocol('https')
  }

  const submit = async () => {
    if (!localPath.trim()) {
      useAppStore.getState().toast('error', '请选择本地文件夹')
      return
    }
    let url = remoteUrl.trim()
    if (createOnGithub) {
      if (!token.trim() || !name.trim()) {
        useAppStore.getState().toast('error', '创建 GitHub 仓库需要 Token 和仓库名')
        return
      }
      const repo = await createGithubRepo({
        token: token.trim(),
        name: name.trim(),
        private: isPrivate,
        description,
        autoInit: false
      })
      if (!repo) return
      url = protocol === 'ssh' ? repo.sshUrl : repo.cloneUrl
    }
    const ok = await initRepo(localPath.trim(), url)
    if (ok) {
      reset()
      onOpenChange(false)
      setActivePage('workspace')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="新建 / 关联仓库"
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={loading.mutation || loading.github}
            onClick={submit}
          >
            {createOnGithub ? '创建并关联' : '初始化'}
          </Button>
        </>
      }
    >
      <Field label="本地文件夹">
        <div className="flex gap-2">
          <Input
            value={localPath}
            onChange={(event) => {
              setLocalPath(event.target.value)
              if (!name) setName(basename(event.target.value))
            }}
            placeholder="C:\Users\you\Desktop\my-project"
            className="code-font"
          />
          <Button
            variant="secondary"
            onClick={async () => {
              const folder = await window.api.pickFolder()
              if (folder) {
                setLocalPath(folder)
                if (!name) setName(basename(folder))
              }
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            浏览
          </Button>
        </div>
      </Field>

      <Field label="远程地址（可选）">
        <Input
          value={remoteUrl}
          onChange={(event) => setRemoteUrl(event.target.value)}
          placeholder="https://github.com/owner/repo.git"
          className="code-font"
          disabled={createOnGithub}
        />
      </Field>

      <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5">
        <span className="text-xs font-medium text-[var(--text)]">同时创建 GitHub 远程仓库</span>
        <Switch checked={createOnGithub} onCheckedChange={setCreateOnGithub} />
      </div>

      {createOnGithub ? (
        <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="GitHub Token">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="ghp_… 或 github_pat_…"
                className="code-font"
              />
            </Field>
            <Field label="仓库名">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="my-project"
              />
            </Field>
            <Field label="协议">
              <Select value={protocol} onChange={(event) => setProtocol(event.target.value as 'https' | 'ssh')}>
                <option value="https">HTTPS</option>
                <option value="ssh">SSH</option>
              </Select>
            </Field>
            <Field label="可见性">
              <div className="flex h-9 items-center justify-between rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3">
                <span className="text-xs text-[var(--text)]">{isPrivate ? '私有' : '公开'}</span>
                <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>
            </Field>
          </div>
          <Field label="描述（可选）">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[60px]"
            />
          </Field>
        </div>
      ) : null}
    </Dialog>
  )
}
