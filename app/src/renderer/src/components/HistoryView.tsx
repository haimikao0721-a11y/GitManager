import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, FileDiff, GitBranch, GitCommitHorizontal, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { HistoryRow } from '@/types/api'
import {
  Button,
  Card,
  ContextMenu,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  Tooltip,
  type ContextMenuItem
} from '@/components/ui'
import { DiffView } from '@/components/DiffView'
import { cn, copyText, graphColor, parseDecorations } from '@/lib/utils'

const ROW_HEIGHT = 44
const LANE_WIDTH = 14

export function HistoryView() {
  const repos = useAppStore((state) => state.repos)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const branches = useAppStore((state) => state.branches)
  const history = useAppStore((state) => state.history)
  const historyFilter = useAppStore((state) => state.historyFilter)
  const loading = useAppStore((state) => state.loading)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const checkoutTarget = useAppStore((state) => state.checkoutTarget)

  const repo = repos.find((item) => item.path === selectedRepoPath)
  const rows = history?.rows ?? []
  const [selectedHash, setSelectedHash] = useState('')
  const [diffHash, setDiffHash] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(620)

  useEffect(() => {
    if (!selectedRepoPath) return
    refreshHistory()
  }, [refreshHistory, selectedRepoPath])

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedHash('')
      return
    }
    if (!rows.some((row) => row.hash === selectedHash)) {
      setSelectedHash(rows[0].hash)
    }
  }, [rows, selectedHash])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const update = () => setViewport(element.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const maxLane = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.maxLane), 0),
    [rows]
  )
  const graphWidth = Math.min(220, Math.max(68, 24 + (maxLane + 1) * LANE_WIDTH))
  const selectedRow = rows.find((row) => row.hash === selectedHash) ?? null

  const localBranches = branches.filter((branch) => branch.type === 'local')
  const remoteBranches = branches.filter((branch) => branch.type === 'remote')

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8)
  const end = Math.min(rows.length, start + Math.ceil(viewport / ROW_HEIGHT) + 16)
  const visibleRows = rows.slice(start, end)

  const selectFilter = async (value: string) => {
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    await refreshHistory(value)
  }

  if (!repo) return null

  return (
    <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_312px]">
      <Card className="flex min-h-[420px] flex-col xl:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2">
          <div className="flex items-center gap-3">
            <div className="w-[210px]">
              <Select value={historyFilter} onChange={(event) => selectFilter(event.target.value)} className="h-8 text-xs">
                <option value="current">当前分支（含上游）</option>
                <option value="all">全部分支与标签</option>
                {localBranches.length > 0 ? (
                  <optgroup label="本地分支">
                    {localBranches.map((branch) => (
                      <option key={branch.refName} value={branch.shortName}>
                        {branch.shortName}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {remoteBranches.length > 0 ? (
                  <optgroup label="远程分支">
                    {remoteBranches.map((branch) => (
                      <option key={branch.refName} value={branch.shortName}>
                        {branch.shortName}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </div>
            {history ? (
              <span className="text-xs tabular-nums text-[var(--faint)]">
                {history.count} 个提交
                {history.count > history.shown ? `（最近 ${history.shown} 条）` : ''}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="grid shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--faint)]"
          style={{ gridTemplateColumns: `${graphWidth}px minmax(0,1fr) 240px 96px 88px` }}
        >
          <span>图形</span>
          <span>提交</span>
          <span className="hidden xl:block">分支 / 标签</span>
          <span className="hidden xl:block">作者</span>
          <span className="text-right">日期</span>
        </div>

        {loading.history && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<GitBranch className="h-5 w-5" />} title="没有提交" className="flex-1" />
        ) : (
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
              {visibleRows.map((row, index) => {
                const absoluteIndex = start + index
                const selected = row.hash === selectedHash
                return (
                  <div
                    key={row.hash}
                    className={cn(
                      'absolute inset-x-0 cursor-pointer border-b border-[var(--border)]/60 transition-colors',
                      selected
                        ? 'bg-[var(--accent-soft)]'
                        : absoluteIndex % 2 === 1
                          ? 'bg-[var(--panel-soft)]/50 hover:bg-[var(--panel-soft)]'
                          : 'hover:bg-[var(--panel-soft)]'
                    )}
                    style={{ top: absoluteIndex * ROW_HEIGHT, height: ROW_HEIGHT }}
                    onClick={() => setSelectedHash(row.hash)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setSelectedHash(row.hash)
                      setMenu({
                        x: event.clientX,
                        y: event.clientY,
                        items: [
                          {
                            label: '查看改动',
                            icon: <FileDiff className="h-3.5 w-3.5" />,
                            onSelect: () => setDiffHash(row.hash)
                          },
                          {
                            label: `签出到此节点 (${row.hash})`,
                            icon: <RotateCcw className="h-3.5 w-3.5" />,
                            onSelect: () => checkoutTarget(row.hash)
                          },
                          {
                            label: '复制提交哈希',
                            icon: <Copy className="h-3.5 w-3.5" />,
                            onSelect: () => copyText(row.hash)
                          }
                        ]
                      })
                    }}
                  >
                    <div
                      className="grid h-full items-center gap-3 px-4"
                      style={{
                        gridTemplateColumns: `${graphWidth}px minmax(0,1fr) 240px 96px 88px`
                      }}
                    >
                      <div className="relative h-full">
                        <GraphCell row={row} width={graphWidth} height={ROW_HEIGHT} selected={selected} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-[var(--text-strong)]" title={row.subject}>
                          {row.subject || '(无提交说明)'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
                          <span className="code-font">{row.hash}</span>
                          <span>·</span>
                          <span className="truncate">{row.author}</span>
                        </div>
                      </div>
                      <div className="hidden min-w-0 flex-wrap items-center gap-1 xl:flex">
                        <DecorationChips decorations={row.decorations} max={3} />
                      </div>
                      <div className="hidden truncate text-xs text-[var(--muted)] xl:block">{row.author}</div>
                      <div className="text-right text-[11px] tabular-nums text-[var(--faint)]">{row.date}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      <CommitDetails
        row={selectedRow}
        repo={repo}
        onSelect={setSelectedHash}
        onViewDiff={() => {
          if (selectedRow) setDiffHash(selectedRow.hash)
        }}
      />
      <Dialog
        open={Boolean(diffHash)}
        onOpenChange={(open) => {
          if (!open) setDiffHash('')
        }}
        title={`提交改动 · ${diffHash.slice(0, 12)}`}
        description="该提交相对父提交的完整差异。"
        width="max-w-[min(1240px,96vw)]"
      >
        {diffHash ? <DiffView repoPath={repo.path} commit={diffHash} /> : null}
      </Dialog>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}

function GraphCell({
  row,
  width,
  height,
  selected
}: {
  row: HistoryRow
  width: number
  height: number
  selected: boolean
}) {
  const mid = height / 2
  const x = (lane: number) => 12 + lane * LANE_WIDTH
  const nodeX = x(row.lane)
  const nodeColor = graphColor(row.color)

  return (
    <svg width={width} height={height} className="overflow-visible">
      {row.through.map((ref, index) => (
        <line
          key={`t-${index}`}
          x1={x(ref.lane)}
          y1={0}
          x2={x(ref.lane)}
          y2={height}
          stroke={graphColor(ref.color)}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {row.incoming.map((ref, index) => (
        <line
          key={`i-${index}`}
          x1={x(ref.lane)}
          y1={0}
          x2={nodeX}
          y2={mid}
          stroke={graphColor(ref.color)}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {row.nodeFromTop ? (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={mid}
          stroke={nodeColor}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ) : null}
      {row.nodeToBottom ? (
        <line
          x1={nodeX}
          y1={mid}
          x2={nodeX}
          y2={height}
          stroke={nodeColor}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ) : null}
      {row.outgoing.map((ref, index) => (
        <line
          key={`o-${index}`}
          x1={nodeX}
          y1={mid}
          x2={x(ref.lane)}
          y2={height}
          stroke={graphColor(ref.color)}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {selected ? <circle cx={nodeX} cy={mid} r={8.5} fill={nodeColor} opacity={0.2} /> : null}
      <circle cx={nodeX} cy={mid} r={4.8} fill={nodeColor} stroke="var(--panel)" strokeWidth={2} />
    </svg>
  )
}

function DecorationChips({ decorations, max = 4 }: { decorations: string; max?: number }) {
  const chips = parseDecorations(decorations)
  if (chips.length === 0) return null
  const visible = chips.slice(0, max)
  const more = chips.length - visible.length
  return (
    <>
      {visible.map((chip, index) => (
        <span
          key={`${chip.text}-${index}`}
          className={cn(
            'max-w-[116px] truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-3.5',
            chip.kind === 'head' && 'border-transparent bg-[var(--text-strong)] text-[var(--bg)]',
            chip.kind === 'tag' && 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]',
            chip.kind === 'remote' && 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]',
            chip.kind === 'branch' && 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]'
          )}
          title={chip.text}
        >
          {chip.text}
        </span>
      ))}
      {more > 0 ? (
        <span className="rounded border border-[var(--border)] bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">
          +{more}
        </span>
      ) : null}
    </>
  )
}

function CommitDetails({
  row,
  repo,
  onSelect,
  onViewDiff
}: {
  row: HistoryRow | null
  repo: { url: string; name: string; path: string }
  onSelect: (hash: string) => void
  onViewDiff: () => void
}) {
  const [copied, setCopied] = useState(false)

  const webUrl = useMemo(() => {
    if (!repo.url) return ''
    return repo.url
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
      .replace(/\.git$/, '')
  }, [repo.url])

  const copy = async () => {
    if (!row) return
    await copyText(row.hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="flex min-h-[300px] flex-col xl:min-h-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <GitCommitHorizontal className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-[13px] font-semibold text-[var(--text-strong)]">提交详情</span>
        {row ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onViewDiff}>
            <FileDiff className="h-3.5 w-3.5" /> 查看改动
          </Button>
        ) : null}
      </div>
      {!row ? (
        <EmptyState
          icon={<GitCommitHorizontal className="h-5 w-5" />}
          title="选择一个提交"
          className="flex-1"
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">提交说明</div>
            <p className="text-[13px] font-medium leading-6 text-[var(--text-strong)]">
              {row.subject || '(无提交说明)'}
            </p>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">哈希</div>
            <div className="flex items-center gap-1.5">
              <code className="code-font min-w-0 flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-xs text-[var(--text)]">
                {row.hash}
              </code>
              <Tooltip content={copied ? '已复制' : '复制'}>
                <Button size="icon" variant="ghost" onClick={copy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </Tooltip>
              {webUrl ? (
                <Tooltip content="在 GitHub 打开">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => window.api.openExternal(`${webUrl}/commit/${row.hash}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Info label="作者" value={row.author || '-'} />
            <Info label="日期" value={row.date || '-'} />
          </div>

          {parseDecorations(row.decorations).length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">分支 / 标签</div>
              <div className="flex flex-wrap gap-1">
                <DecorationChips decorations={row.decorations} max={12} />
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">
              父提交 ({row.parents.length})
            </div>
            <div className="space-y-1">
              {row.parents.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--faint)]">
                  根提交
                </div>
              ) : (
                row.parents.map((parent) => (
                  <button
                    key={parent}
                    onClick={() => onSelect(parent)}
                    className="focus-ring flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--border-strong)]"
                  >
                    <GitCommitHorizontal className="h-3.5 w-3.5 text-[var(--faint)]" />
                    <span className="code-font truncate text-xs text-[var(--text)]">{parent}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-2">
      <div className="text-[11px] text-[var(--faint)]">{label}</div>
      <div className="mt-0.5 truncate text-xs text-[var(--text-strong)]">{value}</div>
    </div>
  )
}
