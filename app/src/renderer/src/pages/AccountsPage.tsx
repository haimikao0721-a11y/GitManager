import { useMemo, useState } from 'react'
import { KeyRound, Pencil, Plus, Star, Trash2, Users } from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { Account, AuthType } from '@/types/api'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Switch,
  Textarea,
  Tooltip
} from '@/components/ui'
import { cn, initials } from '@/lib/utils'

function emptyAccount(configAccounts: number): Account {
  return {
    id: '',
    name: '',
    githubUser: '',
    gitName: '',
    email: '',
    httpsUser: '',
    sshHost: 'github.com',
    sshKey: '',
    defaultOwner: '',
    note: '',
    authType: 'https',
    isDefault: configAccounts === 0
  }
}

export function AccountsPage() {
  const config = useAppStore((state) => state.config)
  const saveAccount = useAppStore((state) => state.saveAccount)
  const deleteAccount = useAppStore((state) => state.deleteAccount)
  const setDefaultAccount = useAppStore((state) => state.setDefaultAccount)
  const setActivePage = useAppStore((state) => state.setActivePage)

  const accounts = config?.accounts ?? []
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)

  const summary = useMemo(() => {
    const https = accounts.filter((account) => account.authType !== 'ssh').length
    const ssh = accounts.filter((account) => account.authType === 'ssh').length
    return { https, ssh }
  }, [accounts])

  const handleSave = async () => {
    if (!editing) return
    if (!editing.name.trim()) {
      useAppStore.getState().toast('error', '账号名称不能为空')
      return
    }
    setSaving(true)
    const ok = await saveAccount(editing, editing.isDefault)
    setSaving(false)
    if (ok) setEditing(null)
  }

  return (
    <div className="mx-auto max-w-[1160px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">账户</h1>
          {accounts.length > 0 ? (
            <span className="text-xs text-[var(--muted)]">
              {accounts.length} 个账号 · {summary.https} HTTPS / {summary.ssh} SSH
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setActivePage('settings')}>
            <KeyRound className="h-3.5 w-3.5" />
            凭据与 SSH
          </Button>
          <Button variant="primary" onClick={() => setEditing(emptyAccount(accounts.length))}>
            <Plus className="h-3.5 w-3.5" />
            新建账号
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="还没有账号"
            description="添加一个 GitHub 账号以配置提交身份和认证方式。"
            action={
              <Button variant="primary" onClick={() => setEditing(emptyAccount(0))}>
                <Plus className="h-3.5 w-3.5" /> 新建账号
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {accounts.map((account) => {
            const authHost =
              account.authType === 'ssh'
                ? `git@${account.sshHost || 'github.com'}`
                : account.httpsUser
                  ? `${account.httpsUser}@github.com`
                  : 'https://github.com'
            return (
              <div
                key={account.id}
                className={cn(
                  'relative flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--panel-soft)]',
                  account.isDefault && 'bg-[var(--accent-soft)]/60'
                )}
              >
                {account.isDefault ? (
                  <span className="pointer-events-none absolute inset-y-2 left-0 w-[2.5px] rounded-r bg-[var(--accent)]" />
                ) : null}

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                  {initials(account.githubUser || account.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-[var(--text-strong)]">
                      {account.name}
                    </span>
                    {account.isDefault ? <Badge variant="accent">默认</Badge> : null}
                    <Badge variant={account.authType === 'ssh' ? 'success' : 'outline'}>
                      {account.authType === 'ssh' ? 'SSH' : 'HTTPS'}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[var(--muted)]">
                    <span className="truncate">{account.githubUser || '未设置 GitHub 用户'}</span>
                    {account.email ? (
                      <>
                        <span className="text-[var(--faint)]">·</span>
                        <span className="truncate text-[var(--faint)]">{account.email}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="hidden min-w-[160px] flex-col items-end gap-0.5 text-right md:flex">
                  <span className="code-font truncate text-xs text-[var(--text)]">{authHost}</span>
                  <span className="text-[11px] text-[var(--faint)]">
                    Owner: {account.defaultOwner || account.githubUser || '-'}
                    {account.gitName ? ` · ${account.gitName}` : ''}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {!account.isDefault ? (
                    <Button size="sm" variant="ghost" onClick={() => setDefaultAccount(account.id)}>
                      <Star className="h-3.5 w-3.5" /> 设为默认
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ ...account })}>
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </Button>
                  <Tooltip content="删除">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-[var(--faint)] hover:text-[var(--danger)]"
                      onClick={() => setDeleteTarget(account)}
                      aria-label="删除账号"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? '编辑账号' : '新建账号'}
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              保存
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="账号名称">
                <Input
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  placeholder="例如：主账号"
                />
              </Field>
              <Field label="GitHub 用户名">
                <Input
                  value={editing.githubUser}
                  onChange={(event) => setEditing({ ...editing, githubUser: event.target.value })}
                  placeholder="username"
                />
              </Field>
              <Field label="user.name">
                <Input
                  value={editing.gitName}
                  onChange={(event) => setEditing({ ...editing, gitName: event.target.value })}
                  placeholder="留空则使用 GitHub 用户名"
                />
              </Field>
              <Field label="user.email">
                <Input
                  value={editing.email}
                  onChange={(event) => setEditing({ ...editing, email: event.target.value })}
                  placeholder="name@users.noreply.github.com"
                />
              </Field>
              <Field label="HTTPS 用户名">
                <Input
                  value={editing.httpsUser}
                  onChange={(event) => setEditing({ ...editing, httpsUser: event.target.value })}
                  placeholder="通常与 GitHub 用户名相同"
                />
              </Field>
              <Field label="默认 Owner">
                <Input
                  value={editing.defaultOwner}
                  onChange={(event) => setEditing({ ...editing, defaultOwner: event.target.value })}
                  placeholder="留空则使用 GitHub 用户名"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="认证方式">
                <div className="flex gap-2">
                  {(['https', 'ssh'] as AuthType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditing({ ...editing, authType: type })}
                      className={cn(
                        'focus-ring h-9 flex-1 rounded-md border text-xs font-medium transition-colors',
                        editing.authType === type
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)] hover:border-[var(--border-strong)]'
                      )}
                    >
                      {type === 'https' ? 'HTTPS' : 'SSH'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="SSH Host">
                <Input
                  value={editing.sshHost}
                  onChange={(event) => setEditing({ ...editing, sshHost: event.target.value })}
                  placeholder="github.com"
                  className="code-font"
                />
              </Field>
            </div>

            <Field label="SSH Key 路径">
              <Input
                value={editing.sshKey}
                onChange={(event) => setEditing({ ...editing, sshKey: event.target.value })}
                placeholder="C:\Users\you\.ssh\id_ed25519"
                className="code-font"
              />
            </Field>

            <Field label="备注（可选）">
              <Textarea
                value={editing.note}
                onChange={(event) => setEditing({ ...editing, note: event.target.value })}
                className="min-h-[64px]"
              />
            </Field>

            <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5">
              <span className="text-xs font-medium text-[var(--text)]">设为默认账号</span>
              <Switch
                checked={editing.isDefault}
                onCheckedChange={(checked) => setEditing({ ...editing, isDefault: checked })}
              />
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除账号"
        description={
          deleteTarget
            ? `确定删除「${deleteTarget.name}」吗？凭据与本地 SSH Key 不会被删除。`
            : undefined
        }
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (deleteTarget) await deleteAccount(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              删除
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  )
}
