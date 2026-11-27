import { useEffect, useMemo, useState } from 'react'
import {
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Github,
  KeyRound,
  Leaf,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sun,
  Terminal,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { Credential, GitHubUser } from '@/types/api'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Select,
  Switch,
  Tooltip
} from '@/components/ui'
import { cn, copyText, shortPath } from '@/lib/utils'

interface ConfirmState {
  title: string
  description: string
  danger?: boolean
  confirmLabel: string
  action: () => Promise<void> | void
}

const themeOptions = [
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'sepia', label: '护眼', icon: Leaf }
] as const

export function SettingsPage() {
  const config = useAppStore((state) => state.config)
  const system = useAppStore((state) => state.system)
  const version = useAppStore((state) => state.version)
  const credentials = useAppStore((state) => state.credentials)
  const ssh = useAppStore((state) => state.ssh)
  const gitProxy = useAppStore((state) => state.gitProxy)
  const systemProxy = useAppStore((state) => state.systemProxy)
  const loading = useAppStore((state) => state.loading)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const updateScanRoots = useAppStore((state) => state.updateScanRoots)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const loadCredentials = useAppStore((state) => state.loadCredentials)
  const revealCredential = useAppStore((state) => state.revealCredential)
  const deleteCredential = useAppStore((state) => state.deleteCredential)
  const clearGithubCredentials = useAppStore((state) => state.clearGithubCredentials)
  const clearBinding = useAppStore((state) => state.clearBinding)
  const storeCredential = useAppStore((state) => state.storeCredential)
  const testGithub = useAppStore((state) => state.testGithub)
  const loadProxies = useAppStore((state) => state.loadProxies)
  const setGitProxy = useAppStore((state) => state.setGitProxy)
  const clearGitProxy = useAppStore((state) => state.clearGitProxy)
  const setSystemProxy = useAppStore((state) => state.setSystemProxy)
  const clearSystemProxy = useAppStore((state) => state.clearSystemProxy)
  const loadSsh = useAppStore((state) => state.loadSsh)
  const generateSshKey = useAppStore((state) => state.generateSshKey)
  const saveSshConfig = useAppStore((state) => state.saveSshConfig)
  const testSsh = useAppStore((state) => state.testSsh)

  const settings = config?.settings
  const accounts = config?.accounts ?? []
  const [gitProxyUrl, setGitProxyUrl] = useState('')
  const [systemServer, setSystemServer] = useState('')
  const [systemEnabled, setSystemEnabled] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null)
  const [secretVisibility, setSecretVisibility] = useState<Record<string, boolean>>({})
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const [tokenDialog, setTokenDialog] = useState(false)
  const [tokenTarget, setTokenTarget] = useState('GitAccountSwitcherV2:github')
  const [tokenUser, setTokenUser] = useState('')
  const [tokenSecret, setTokenSecret] = useState('')

  const [sshDialog, setSshDialog] = useState(false)
  const [keyPath, setKeyPath] = useState('')
  const [keyComment, setKeyComment] = useState('')
  const [keyOverwrite, setKeyOverwrite] = useState(false)

  const [configDialog, setConfigDialog] = useState(false)
  const [sshHost, setSshHost] = useState('github.com')
  const [sshHostName, setSshHostName] = useState('github.com')
  const [sshUser, setSshUser] = useState('git')
  const [sshIdentity, setSshIdentity] = useState('')

  useEffect(() => {
    loadCredentials()
    loadProxies()
    loadSsh()
  }, [loadCredentials, loadProxies, loadSsh])

  useEffect(() => {
    setGitProxyUrl(gitProxy.https || gitProxy.http || '')
  }, [gitProxy.http, gitProxy.https])

  useEffect(() => {
    setSystemServer(systemProxy.server)
    setSystemEnabled(systemProxy.enabled)
  }, [systemProxy.enabled, systemProxy.server])

  const defaultAccount = accounts.find((account) => account.isDefault) ?? accounts[0]
  const gitCredentials = useMemo(
    () => credentials.filter(isGitCredential),
    [credentials]
  )

  const startGenerateKey = () => {
    const alias = defaultAccount?.githubUser || 'github'
    setKeyPath(`${ssh?.sshDir ?? '~/.ssh'}\\id_ed25519_${alias}`)
    setKeyComment(defaultAccount?.email || 'GitAccountSwitcherV2')
    setKeyOverwrite(false)
    setSshDialog(true)
  }

  const startSshConfig = (identityFile = '') => {
    setSshHost(defaultAccount?.sshHost || 'github.com')
    setSshHostName(defaultAccount?.sshHost || 'github.com')
    setSshUser('git')
    setSshIdentity(identityFile || ssh?.keys[0]?.path || '')
    setConfigDialog(true)
  }

  const addRoot = async () => {
    const folder = await window.api.pickFolder()
    if (!folder) return
    const roots = Array.from(new Set([...(config?.scanRoots ?? []), folder]))
    await updateScanRoots(roots)
  }

  const removeRoot = async (root: string) => {
    const roots = (config?.scanRoots ?? []).filter((item) => item !== root)
    await updateScanRoots(roots)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">设置</h1>
          <span className="text-xs text-[var(--faint)]">v{version}</span>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle title="外观与常规" />
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <Field label="主题">
                <div className="grid grid-cols-3 gap-1.5">
                  {themeOptions.map((theme) => {
                    const Icon = theme.icon
                    const active = settings?.theme === theme.id
                    return (
                      <button
                        key={theme.id}
                        onClick={() => updateSettings({ theme: theme.id })}
                        className={cn(
                          'focus-ring flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors',
                          active
                            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {theme.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field label="提交历史上限">
                <Select
                  value={String(settings?.historyLimit ?? 2000)}
                  onChange={(event) => updateSettings({ historyLimit: Number(event.target.value) })}
                >
                  <option value="500">500 条</option>
                  <option value="1000">1000 条</option>
                  <option value="2000">2000 条</option>
                  <option value="5000">5000 条</option>
                  <option value="10000">10000 条</option>
                </Select>
              </Field>

              <Field label="编辑器命令">
                <Input
                  value={settings?.editor ?? 'code'}
                  onChange={(event) => updateSettings({ editor: event.target.value })}
                  placeholder="code"
                  className="code-font"
                />
              </Field>
              <Field label="终端命令">
                <Input
                  value={settings?.terminal ?? 'wt'}
                  onChange={(event) => updateSettings({ terminal: event.target.value })}
                  placeholder="wt"
                  className="code-font"
                />
              </Field>

              <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5 md:col-span-2">
                <span className="text-xs font-medium text-[var(--text)]">破坏性操作前确认</span>
                <Switch
                  checked={settings?.confirmDestructive ?? true}
                  onCheckedChange={(checked) => updateSettings({ confirmDestructive: checked })}
                />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle
              title="扫描目录"
              action={
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={addRoot}>
                    <FolderPlus className="h-3.5 w-3.5" /> 添加
                  </Button>
                  <Button size="sm" variant="ghost" loading={loading.scan} onClick={() => scanRepos()}>
                    <RefreshCw className="h-3.5 w-3.5" /> 扫描
                  </Button>
                </div>
              }
            />
            <div className="space-y-1.5">
              {(config?.scanRoots ?? []).length === 0 ? (
                <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="没有扫描目录" className="py-6" />
              ) : (
                (config?.scanRoots ?? []).map((root) => (
                  <div
                    key={root}
                    className="flex items-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2"
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                    <span className="code-font min-w-0 flex-1 truncate text-xs text-[var(--text)]" title={root}>
                      {root}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-[var(--faint)] hover:text-[var(--danger)]"
                      onClick={() => removeRoot(root)}
                      title="移除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <SectionTitle title="Git 代理" />
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    value={gitProxyUrl}
                    onChange={(event) => setGitProxyUrl(event.target.value)}
                    placeholder="http://127.0.0.1:7890"
                    className="code-font"
                  />
                </div>
                <Button size="sm" variant="secondary" onClick={() => setGitProxy(gitProxyUrl)}>
                  保存
                </Button>
                <Button size="sm" variant="ghost" onClick={clearGitProxy}>
                  清除
                </Button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <ProxyValue label="http.proxy" value={gitProxy.http} />
                <ProxyValue label="https.proxy" value={gitProxy.https} />
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle
                title="系统代理"
                action={
                  <Badge variant={systemProxy.enabled ? 'success' : 'muted'} dot>
                    {systemProxy.enabled ? '已启用' : '未启用'}
                  </Badge>
                }
              />
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    value={systemServer}
                    onChange={(event) => setSystemServer(event.target.value)}
                    placeholder="127.0.0.1:7890"
                    className="code-font"
                  />
                </div>
                <Button
                  size="sm"
                  variant={systemEnabled ? 'secondary' : 'primary'}
                  onClick={async () => {
                    await setSystemProxy(systemServer)
                    setSystemEnabled(true)
                  }}
                >
                  应用
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSystemProxy}>
                  关闭
                </Button>
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1.5">
                  {systemProxy.enabled ? (
                    <Wifi className="h-3.5 w-3.5 text-[var(--success)]" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-[var(--faint)]" />
                  )}
                  {systemProxy.server || '未设置'}
                </span>
                {systemProxy.autoConfig ? <span className="truncate">PAC: {systemProxy.autoConfig}</span> : null}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <SectionTitle
              title="GitHub Token 测试"
              action={githubUser ? <Badge variant="success" dot>{githubUser.login}</Badge> : null}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[240px] flex-1">
                <Input
                  type="password"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder="ghp_… 或 github_pat_…"
                  className="code-font"
                />
              </div>
              <Button
                variant="secondary"
                loading={loading.github}
                disabled={!githubToken.trim()}
                onClick={async () => {
                  const user = await testGithub(githubToken.trim())
                  if (user) setGithubUser(user)
                }}
              >
                <Github className="h-3.5 w-3.5" /> 测试
              </Button>
              <Button
                variant="ghost"
                disabled={!githubUser || !githubToken.trim()}
                onClick={async () => {
                  if (!githubUser) return
                  await storeCredential('GitAccountSwitcherV2:github', githubUser.login, githubToken.trim())
                }}
              >
                保存为凭据
              </Button>
            </div>
            {githubUser ? (
              <div className="mt-3 flex items-center gap-3 rounded-md border border-[var(--success-border)] bg-[var(--success-soft)] px-3.5 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--panel)] text-xs font-semibold text-[var(--success)]">
                  {githubUser.login.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-strong)]">
                    {githubUser.name || githubUser.login}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    @{githubUser.login} · {githubUser.publicRepos} 公开 / {githubUser.totalPrivateRepos} 私有
                  </div>
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <SectionTitle
              title="Git 凭据"
              action={
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setTokenDialog(true)}>
                    <Plus className="h-3.5 w-3.5" /> 添加
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                    onClick={() =>
                      setConfirm({
                        title: '清除 GitHub 凭据',
                        description: '确定删除所有 GitHub 相关凭据吗？',
                        danger: true,
                        confirmLabel: '清除',
                        action: clearGithubCredentials
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 清除 GitHub
                  </Button>
                </div>
              }
            />
            {gitCredentials.length === 0 ? (
              <EmptyState
                icon={<KeyRound className="h-5 w-5" />}
                title={loading.credentials ? '读取中…' : '暂无 Git 凭据'}
                className="py-6"
              />
            ) : (
              <div className="space-y-1.5">
                {gitCredentials.map((credential) => (
                  <CredentialRow
                    key={`${credential.target}:${credential.userName}`}
                    credential={credential}
                    visible={Boolean(secretVisibility[credential.target])}
                    onToggleVisibility={async () => {
                      if (!credential.secret) await revealCredential(credential.target)
                      setSecretVisibility((state) => ({
                        ...state,
                        [credential.target]: !state[credential.target]
                      }))
                    }}
                    onCopy={async () => {
                      if (!credential.secret) await revealCredential(credential.target)
                      const secret = useAppStore
                        .getState()
                        .credentials.find((item) => item.target === credential.target)?.secret
                      if (secret) await copyText(secret)
                    }}
                    onDelete={() =>
                      setConfirm({
                        title: '删除凭据',
                        description: `确定删除「${credential.target}」吗？`,
                        danger: true,
                        confirmLabel: '删除',
                        action: () => deleteCredential(credential.target)
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle
              title="SSH Key"
              action={
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={startGenerateKey}>
                    <Plus className="h-3.5 w-3.5" /> 生成 Key
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startSshConfig()}>
                    <Terminal className="h-3.5 w-3.5" /> 写配置
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => testSsh(defaultAccount?.sshHost || 'github.com')}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> 测试
                  </Button>
                </div>
              }
            />
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {(ssh?.keys ?? []).length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--faint)] lg:col-span-2">
                  暂无公钥
                </div>
              ) : (
                (ssh?.keys ?? []).map((key) => (
                  <div
                    key={key.path}
                    className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <KeyRound className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        <span className="truncate text-xs font-medium text-[var(--text-strong)]">
                          {key.name}
                        </span>
                        <Badge variant="outline">{key.type}</Badge>
                      </div>
                      <Tooltip content="复制公钥">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyText(key.publicKey)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </Tooltip>
                    </div>
                    <div className="code-font mt-1.5 truncate text-[11px] text-[var(--muted)]" title={key.path}>
                      {shortPath(key.path, 68)}
                    </div>
                    {key.comment ? (
                      <div className="mt-0.5 truncate text-[11px] text-[var(--faint)]">{key.comment}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            {ssh?.configPath ? (
              <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--faint)]">
                <span className="code-font truncate">{ssh.configPath}</span>
                <span>·</span>
                <span>{ssh.privateKeys.length} 个私钥</span>
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <SectionTitle title="本机重置" />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-3">
              <div className="text-xs text-[var(--text)]">
                清除本机 Git 全局身份、GitHub 凭据与全局 Git 代理（会先备份到数据目录）。
              </div>
              <Button
                variant="danger"
                size="sm"
                loading={loading.credentials}
                onClick={() =>
                  setConfirm({
                    title: '清除本机 Git 绑定',
                    description:
                      '将清除 GitHub 凭据、.git-credentials 中的 GitHub 记录、全局 user.name/user.email 与 Git 代理。',
                    danger: true,
                    confirmLabel: '全部清除',
                    action: clearBinding
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" /> 清除本机绑定
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle
              title="环境信息"
              action={
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => system?.dataDir && window.api.openPath(system.dataDir)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> 数据目录
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                    onClick={() => window.api.quit()}
                  >
                    <LogOut className="h-3.5 w-3.5" /> 退出
                  </Button>
                </div>
              }
            />
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <AboutRow label="Git 版本" value={system?.git.version || '未检测到'} />
              <AboutRow label="Git 路径" value={system?.git.path || '-'} mono />
              <AboutRow label="配置文件" value={system?.configPath || '-'} mono />
              <AboutRow label="数据目录" value={system?.dataDir || '-'} mono />
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={tokenDialog}
        onOpenChange={setTokenDialog}
        title="添加凭据"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTokenDialog(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!tokenTarget.trim() || !tokenSecret.trim()) {
                  useAppStore.getState().toast('error', 'Target 和 Token 不能为空')
                  return
                }
                await storeCredential(tokenTarget.trim(), tokenUser.trim(), tokenSecret.trim())
                setTokenSecret('')
                setTokenDialog(false)
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <Field label="Target">
          <Input value={tokenTarget} onChange={(event) => setTokenTarget(event.target.value)} className="code-font" />
        </Field>
        <Field label="用户名（可选）">
          <Input value={tokenUser} onChange={(event) => setTokenUser(event.target.value)} placeholder="github 用户名" />
        </Field>
        <Field label="Token">
          <Input
            type="password"
            value={tokenSecret}
            onChange={(event) => setTokenSecret(event.target.value)}
            placeholder="ghp_… 或 github_pat_…"
            className="code-font"
          />
        </Field>
      </Dialog>

      <Dialog
        open={sshDialog}
        onOpenChange={setSshDialog}
        title="生成 SSH Key"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSshDialog(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={loading.ssh}
              onClick={async () => {
                const result = await generateSshKey(keyPath.trim(), keyComment.trim(), keyOverwrite)
                if (result) {
                  await copyText(result.publicKey)
                  setSshDialog(false)
                  useAppStore.getState().toast('success', '公钥已复制到剪贴板')
                }
              }}
            >
              生成
            </Button>
          </>
        }
      >
        <Field label="私钥路径">
          <div className="flex gap-2">
            <Input value={keyPath} onChange={(event) => setKeyPath(event.target.value)} className="code-font" />
            <Button
              variant="secondary"
              onClick={async () => {
                const file = await window.api.pickFile([{ name: '所有文件', extensions: ['*'] }])
                if (file) setKeyPath(file)
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Field>
        <Field label="注释 / 邮箱">
          <Input value={keyComment} onChange={(event) => setKeyComment(event.target.value)} />
        </Field>
        <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5">
          <span className="text-xs font-medium text-[var(--text)]">覆盖已有 Key</span>
          <Switch checked={keyOverwrite} onCheckedChange={setKeyOverwrite} />
        </div>
      </Dialog>

      <Dialog
        open={configDialog}
        onOpenChange={setConfigDialog}
        title="写入 ~/.ssh/config"
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfigDialog(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const ok = await saveSshConfig(sshHost, sshHostName, sshUser, sshIdentity)
                if (ok) setConfigDialog(false)
              }}
            >
              写入
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host 别名">
            <Input value={sshHost} onChange={(event) => setSshHost(event.target.value)} className="code-font" />
          </Field>
          <Field label="HostName">
            <Input value={sshHostName} onChange={(event) => setSshHostName(event.target.value)} className="code-font" />
          </Field>
          <Field label="User">
            <Input value={sshUser} onChange={(event) => setSshUser(event.target.value)} className="code-font" />
          </Field>
          <Field label="IdentityFile">
            <Input value={sshIdentity} onChange={(event) => setSshIdentity(event.target.value)} className="code-font" />
          </Field>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3">
          <pre className="code-font whitespace-pre-wrap text-[11px] leading-5 text-[var(--muted)]">{`Host ${sshHost}
    HostName ${sshHostName}
    User ${sshUser}
    IdentityFile ${sshIdentity || '~/.ssh/id_ed25519'}
    IdentitiesOnly yes`}</pre>
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
  )
}

function isGitCredential(credential: Credential): boolean {
  if (credential.isGitHub) return true
  const target = credential.target.toLowerCase()
  return (
    target.startsWith('git:') ||
    target.includes('github') ||
    target.includes('gitlab') ||
    target.includes('gitee') ||
    target.includes('bitbucket') ||
    target.includes('gitaccountswitcher')
  )
}

function ProxyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5">
      <div className="text-[11px] text-[var(--faint)]">{label}</div>
      <div
        className={
          value
            ? 'code-font mt-0.5 truncate text-xs text-[var(--success)]'
            : 'mt-0.5 text-xs text-[var(--faint)]'
        }
      >
        {value || '未设置'}
      </div>
    </div>
  )
}

function CredentialRow({
  credential,
  visible,
  onToggleVisibility,
  onCopy,
  onDelete
}: {
  credential: Credential
  visible: boolean
  onToggleVisibility: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const secret = credential.secret ?? ''
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2">
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-xs font-medium text-[var(--text-strong)]" title={credential.target}>
            {credential.target}
          </span>
          {credential.isGitHub ? <Badge variant="accent">GitHub</Badge> : null}
          <Badge variant="outline">{credential.type}</Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--faint)]">
          <span>{credential.userName || '无用户名'}</span>
          {credential.lastWritten ? (
            <>
              <span>·</span>
              <span>{credential.lastWritten}</span>
            </>
          ) : null}
          {visible ? (
            <span className="code-font max-w-[360px] truncate text-[var(--warning)]" title={secret}>
              {secret || '无法读取'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Tooltip content={visible ? '隐藏' : '显示'}>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggleVisibility}>
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </Tooltip>
        <Tooltip content="复制">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content="删除">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-[var(--faint)] hover:text-[var(--danger)]"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}

function AboutRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2">
      <div className="text-[11px] text-[var(--faint)]">{label}</div>
      <div className={cn('mt-0.5 truncate text-xs text-[var(--text-strong)]', mono && 'code-font')} title={value}>
        {value}
      </div>
    </div>
  )
}
