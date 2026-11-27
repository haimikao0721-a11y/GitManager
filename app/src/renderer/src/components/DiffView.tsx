import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileDiff } from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { DiffResult } from '@/types/api'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

type DiffMode = 'unstaged' | 'staged'

interface DiffViewProps {
  repoPath: string
  file?: string
  commit?: string
  commitFile?: string
  stash?: number
  initialMode?: DiffMode
  unstagedAvailable?: boolean
  stagedAvailable?: boolean
  className?: string
  onChanged?: () => void | Promise<void>
  onClose?: () => void
}

interface DiffHunk {
  header: string
  lines: string[]
}

interface DiffSection {
  header: string[]
  hunks: DiffHunk[]
}

function parseDiff(text: string): DiffSection[] {
  const sections: DiffSection[] = []
  let section: DiffSection | null = null
  let hunk: DiffHunk | null = null
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('diff --git ')) {
      section = { header: [line], hunks: [] }
      sections.push(section)
      hunk = null
      continue
    }
    if (!section) {
      section = { header: [], hunks: [] }
      sections.push(section)
    }
    if (line.startsWith('@@')) {
      hunk = { header: line, lines: [] }
      section.hunks.push(hunk)
      continue
    }
    if (hunk) hunk.lines.push(line)
    else section.header.push(line)
  }
  return sections.filter((item) => item.header.length > 0 || item.hunks.length > 0)
}

function hunkRange(header: string): { oldStart: number; newStart: number } {
  const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  return {
    oldStart: match ? Number(match[1]) : 0,
    newStart: match ? Number(match[2]) : 0
  }
}

function buildHunkPatch(section: DiffSection, hunk: DiffHunk): string {
  return [...section.header, hunk.header, ...hunk.lines].join('\n') + '\n'
}

export function DiffView({
  repoPath,
  file,
  commit,
  commitFile,
  stash,
  initialMode,
  unstagedAvailable = true,
  stagedAvailable = false,
  className,
  onChanged
}: DiffViewProps) {
  const toast = useAppStore((state) => state.toast)
  const [mode, setMode] = useState<DiffMode>(
    initialMode ?? (unstagedAvailable ? 'unstaged' : 'staged')
  )
  const [diff, setDiff] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyHunk, setBusyHunk] = useState('')

  useEffect(() => {
    if (!commit && stash === undefined) {
      setMode(initialMode ?? (unstagedAvailable ? 'unstaged' : 'staged'))
    }
  }, [file, commit, stash, initialMode, unstagedAvailable])

  const load = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError('')
    try {
      const result =
        stash !== undefined
          ? await window.api.invoke<DiffResult>('repo.stash.diff', {
              path: repoPath,
              index: stash
            })
          : commit
            ? await window.api.invoke<DiffResult>('repo.show', {
                path: repoPath,
                hash: commit,
                file: commitFile ?? ''
              })
            : await window.api.invoke<DiffResult>('repo.diff', {
                path: repoPath,
                staged: mode === 'staged',
                file: file ?? ''
              })
      setDiff(result.diff ?? '')
      if (result.error) setError(result.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setDiff('')
    } finally {
      setLoading(false)
    }
  }, [commit, commitFile, file, mode, repoPath, stash])

  useEffect(() => {
    void load()
  }, [load])

  const sections = useMemo(() => parseDiff(diff), [diff])
  const lines = useMemo(() => diff.split('\n').length, [diff])

  const stageHunk = async (section: DiffSection, hunk: DiffHunk) => {
    if (!file || commit || stash !== undefined) return
    const key = `${section.header[0] ?? ''}:${hunk.header}`
    setBusyHunk(key)
    try {
      await window.api.invoke('repo.patch', {
        path: repoPath,
        patch: buildHunkPatch(section, hunk),
        cached: true,
        reverse: mode === 'staged'
      })
      toast('success', mode === 'staged' ? '已取消暂存此段' : '已暂存此段')
      await load()
      await onChanged?.()
    } catch (cause) {
      toast(
        'error',
        mode === 'staged' ? '取消暂存失败' : '暂存失败',
        cause instanceof Error ? cause.message : String(cause)
      )
    } finally {
      setBusyHunk('')
    }
  }

  const binary = /Binary files .* differ/.test(diff)
  const tooLarge = lines > 5000
  const canPatch = Boolean(file && !commit && stash === undefined)

  return (
    <div className={cn('flex min-h-[320px] flex-col', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileDiff className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span
            className="code-font truncate text-xs text-[var(--text)]"
            title={commitFile || file || commit || (stash !== undefined ? `stash@{${stash}}` : '')}
          >
            {commitFile || file || (stash !== undefined ? `stash@{${stash}}` : `提交 ${commit?.slice(0, 12)}`)}
          </span>
          {!commit && stash === undefined ? (
            <div className="inline-flex h-7 items-center rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-0.5">
              <button
                type="button"
                disabled={!unstagedAvailable}
                onClick={() => setMode('unstaged')}
                className={cn(
                  'focus-ring h-full rounded px-2 text-[11px] font-medium transition-colors',
                  mode === 'unstaged'
                    ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]',
                  !unstagedAvailable && 'cursor-not-allowed opacity-40'
                )}
              >
                未暂存
              </button>
              <button
                type="button"
                disabled={!stagedAvailable}
                onClick={() => setMode('staged')}
                className={cn(
                  'focus-ring h-full rounded px-2 text-[11px] font-medium transition-colors',
                  mode === 'staged'
                    ? 'bg-[var(--panel)] text-[var(--text-strong)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]',
                  !stagedAvailable && 'cursor-not-allowed opacity-40'
                )}
              >
                已暂存
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--faint)]">
          {diff ? <span className="tabular-nums">{lines} 行</span> : null}
          <Button size="sm" variant="ghost" onClick={() => void load()} loading={loading}>
            重新加载
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs text-[var(--danger)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <pre className="min-w-0 whitespace-pre-wrap break-words font-sans">{error}</pre>
        </div>
      ) : !diff.trim() ? (
        <EmptyState
          icon={<FileDiff className="h-5 w-5" />}
          title={
            stash !== undefined
              ? '该 Stash 没有可显示的代码差异'
              : mode === 'staged'
                ? '暂无已暂存改动'
                : '暂无未暂存改动'
          }
          description={
            stash !== undefined
              ? '可能只包含未跟踪文件，或暂存内容已与当前工作区一致。'
              : '如果这是未跟踪文件，请先暂存后再查看差异。'
          }
          className="flex-1"
        />
      ) : binary ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-3 text-xs text-[var(--muted)]">
          二进制文件差异无法以文本显示。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--panel-solid)]">
          {tooLarge ? (
            <div className="border-b border-[var(--border)] bg-[var(--warning-soft)] px-3 py-2 text-[11px] text-[var(--warning)]">
              差异较大，已显示前 5000 行。
            </div>
          ) : null}
          <div className="code-font min-w-max text-[11px] leading-5">
            {sections.slice(0, 240).map((section, sectionIndex) => (
              <div key={`${section.header[0] ?? 'section'}-${sectionIndex}`}>
                {section.header.map((line, index) => (
                  <div
                    key={`h-${index}`}
                    className="whitespace-pre border-b border-[var(--border)]/40 bg-[var(--panel-soft)] px-3 py-0.5 text-[var(--faint)]"
                  >
                    {line}
                  </div>
                ))}
                {section.hunks.map((hunk, hunkIndex) => {
                  return (
                    <div key={`${hunk.header}-${hunkIndex}`}>
                      <div className="flex items-center gap-2 border-y border-[var(--border)] bg-[var(--diff-hunk-bg)] px-2 py-1">
                        <span className="min-w-0 flex-1 truncate text-[var(--accent)]">{hunk.header}</span>
                        {canPatch ? (
                          <button
                            type="button"
                            title={mode === 'staged' ? '取消暂存此段' : '只暂存此段'}
                            disabled={Boolean(busyHunk)}
                            onClick={() => void stageHunk(section, hunk)}
                            className="focus-ring h-6 shrink-0 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[10px] font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
                          >
                            {busyHunk ? '处理中…' : mode === 'staged' ? '取消暂存' : '暂存此段'}
                          </button>
                        ) : null}
                      </div>
                      <HunkLines hunk={hunk} />
                    </div>
                  )
                })}
              </div>
            ))}
            {sections.length > 240 ? (
              <div className="px-3 py-2 text-[var(--faint)]">仅显示前 240 个文件。</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function HunkLines({ hunk }: { hunk: DiffHunk }) {
  const { oldStart, newStart } = hunkRange(hunk.header)
  let oldLine = oldStart
  let newLine = newStart
  return (
    <div>
      {hunk.lines.slice(0, 5000).map((line, index) => {
        const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx'
        const oldNumber = kind === 'add' ? '' : oldLine
        const newNumber = kind === 'del' ? '' : newLine
        if (kind !== 'add') oldLine++
        if (kind !== 'del') newLine++
        return (
          <div
            key={`${index}-${line}`}
            className={cn(
              'flex whitespace-pre',
              kind === 'add' && 'bg-[var(--diff-add-bg)]',
              kind === 'del' && 'bg-[var(--diff-del-bg)]'
            )}
          >
            <span
              className={cn(
                'w-10 shrink-0 select-none border-r border-[var(--border)] px-1 text-right',
                kind === 'add' && 'bg-[var(--diff-add-gutter)] text-[var(--success)]',
                kind === 'del' && 'bg-[var(--diff-del-gutter)] text-[var(--danger)]',
                kind === 'ctx' && 'text-[var(--faint)]'
              )}
            >
              {oldNumber}
            </span>
            <span
              className={cn(
                'w-10 shrink-0 select-none border-r border-[var(--border)] px-1 text-right',
                kind === 'add' && 'bg-[var(--diff-add-gutter)] text-[var(--success)]',
                kind === 'del' && 'bg-[var(--diff-del-gutter)] text-[var(--danger)]',
                kind === 'ctx' && 'text-[var(--faint)]'
              )}
            >
              {newNumber}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 px-2',
                kind === 'add' && 'text-[var(--success)]',
                kind === 'del' && 'text-[var(--danger)]'
              )}
            >
              {line || ' '}
            </span>
          </div>
        )
      })}
    </div>
  )
}
