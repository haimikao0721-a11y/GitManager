import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FileDiff, GitBranch, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/app'
import type { HistoryRow } from '@/types/api'
import {
  Card,
  ContextMenu,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  type ContextMenuItem
} from '@/components/ui'
import { DiffView } from '@/components/DiffView'
import { cn, copyText, graphColor, parseDecorations } from '@/lib/utils'

const ROW_HEIGHT = 44
const LANE_WIDTH = 16

export function HistoryView() {
  const repos = useAppStore((state) => state.repos)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const branches = useAppStore((state) => state.branches)
  const history = useAppStore((state) => state.history)
  const historyFilter = useAppStore((state) => state.historyFilter)
  const loading = useAppStore((state) => state.loading)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const checkoutTarget = useAppStore((state) => state.checkoutTarget)
  const selectedHash = useAppStore((state) => state.selectedCommitHash)
  const setSelectedHash = useAppStore((state) => state.setSelectedCommitHash)
  const setInspectorFocus = useAppStore((state) => state.setInspectorFocus)
  const setInspectorOpen = useAppStore((state) => state.setInspectorOpen)
  const setInspectorTab = useAppStore((state) => state.setInspectorTab)

  const repo = repos.find((item) => item.path === selectedRepoPath)
  const rows = history?.rows ?? []
  const [diffHash, setDiffHash] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(620)
  const [containerWidth, setContainerWidth] = useState(640)

  useEffect(() => {
    if (!selectedRepoPath) return
    refreshHistory()
  }, [refreshHistory, selectedRepoPath])

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedHash) setSelectedHash('')
      return
    }
    if (!rows.some((row) => row.hash === selectedHash)) {
      setSelectedHash(rows[0].hash)
    }
  }, [rows, selectedHash, setSelectedHash])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const update = () => {
      setViewport(element.clientHeight)
      setContainerWidth(element.clientWidth)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const maxLane = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.maxLane), 0),
    [rows]
  )
  const graphWidth = Math.min(280, Math.max(54, 24 + (maxLane + 1) * LANE_WIDTH))
  const showAuthor = containerWidth >= 820
  const showTagsCol = containerWidth >= 510
  const showDateCol = containerWidth >= 400
  const tagsWidth = containerWidth >= 700 ? 184 : 138
  const gridColumns = [
    `${graphWidth}px`,
    'minmax(0,1fr)',
    ...(showTagsCol ? [`${tagsWidth}px`] : []),
    ...(showAuthor ? ['88px'] : []),
    ...(showDateCol ? ['74px'] : [])
  ].join(' ')
  const tagMax = containerWidth >= 700 ? 2 : 1

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
    <div className="flex min-h-[260px] flex-1 flex-col xl:min-h-0">
      <Card className="flex min-h-[260px] flex-1 flex-col xl:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2">
          <div className="flex items-center gap-3">
            <div className="w-[210px]">
              <Select value={historyFilter} onChange={(event) => selectFilter(event.target.value)} className="h-8 text-xs">
                <option value="all">全部分支与标签</option>
                <option value="current">当前分支（含上游）</option>
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
          className="grid shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-2 text-xs font-medium text-[var(--faint)]"
          style={{ gridTemplateColumns: gridColumns }}
        >
          <span className="whitespace-nowrap">图形</span>
          <span className="whitespace-nowrap">提交</span>
          {showTagsCol ? <span className="whitespace-nowrap">分支 / 标签</span> : null}
          {showAuthor ? <span className="whitespace-nowrap">作者</span> : null}
          {showDateCol ? <span className="whitespace-nowrap text-right">日期</span> : null}
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
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
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
                    onClick={() => {
                      setSelectedHash(row.hash)
                      setInspectorFocus('commit')
                    }}
                    onDoubleClick={() => {
                      setSelectedHash(row.hash)
                      setInspectorFocus('commit')
                      setInspectorTab('changes')
                      setInspectorOpen(true)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setSelectedHash(row.hash)
                      setInspectorFocus('commit')
                      setMenu({
                        x: event.clientX,
                        y: event.clientY,
                        items: [
                          {
                            label: '在右侧栏查看变更',
                            icon: <FileDiff className="h-3.5 w-3.5" />,
                            onSelect: () => {
                              setSelectedHash(row.hash)
                              setInspectorFocus('commit')
                              setInspectorTab('changes')
                              setInspectorOpen(true)
                            }
                          },
                          {
                            label: '大窗查看全部改动',
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
                      className="grid h-full items-center gap-2.5 px-3.5"
                      style={{ gridTemplateColumns: gridColumns }}
                    >
                      <div className="relative h-full">
                        <GraphCell row={row} width={graphWidth} height={ROW_HEIGHT} selected={selected} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-strong)]" title={row.subject}>
                            {row.subject || '(无提交说明)'}
                          </div>
                          {!showTagsCol && row.decorations ? (
                            <div className="flex shrink-0 flex-nowrap items-center gap-1 overflow-hidden">
                              <DecorationChips decorations={row.decorations} max={1} compact />
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
                          <span className="code-font shrink-0">{row.hash}</span>
                          <span>·</span>
                          <span className="truncate">{row.author}</span>
                          {!showDateCol ? (
                            <>
                              <span>·</span>
                              <span className="shrink-0 tabular-nums">{row.date}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      {showTagsCol ? (
                        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
                          <DecorationChips decorations={row.decorations} max={tagMax} compact={containerWidth < 700} />
                        </div>
                      ) : null}
                      {showAuthor ? (
                        <div className="truncate text-xs text-[var(--muted)]">{row.author}</div>
                      ) : null}
                      {showDateCol ? (
                        <div className="text-right text-[11px] tabular-nums text-[var(--faint)]">{row.date}</div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

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
  const x = (lane: number) => 14 + lane * LANE_WIDTH
  const nodeX = x(row.lane)
  const nodeColor = graphColor(row.color)
  const chips = parseDecorations(row.decorations)
  const isHead = chips.some((chip) => chip.kind === 'head') || row.decorations.includes('HEAD')
  const isMerge = row.parents.length > 1
  const isBranchTip = !row.nodeFromTop && row.nodeToBottom && !isHead

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
          strokeLinecap="butt"
        />
      ))}
      {row.incoming.map((ref, index) => {
        const x1 = x(ref.lane)
        return (
          <path
            key={`i-${index}`}
            d={`M ${x1} 0 C ${x1} ${mid * 0.65}, ${nodeX} ${mid * 0.35}, ${nodeX} ${mid}`}
            fill="none"
            stroke={graphColor(ref.color)}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
      {row.nodeFromTop ? (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={mid}
          stroke={nodeColor}
          strokeWidth={2.2}
          strokeLinecap="butt"
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
          strokeLinecap="butt"
        />
      ) : null}
      {row.outgoing.map((ref, index) => {
        const x2 = x(ref.lane)
        return (
          <path
            key={`o-${index}`}
            d={`M ${nodeX} ${mid} C ${nodeX} ${mid + (height - mid) * 0.35}, ${x2} ${mid + (height - mid) * 0.65}, ${x2} ${height}`}
            fill="none"
            stroke={graphColor(ref.color)}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
      {selected ? <circle cx={nodeX} cy={mid} r={9.5} fill={nodeColor} opacity={0.18} /> : null}
      <circle
        cx={nodeX}
        cy={mid}
        r={isHead || isBranchTip || isMerge ? 6.8 : 5.4}
        fill="var(--panel)"
      />
      {isHead ? (
        <>
          <circle cx={nodeX} cy={mid} r={7.8} fill="none" stroke={nodeColor} strokeWidth={1.5} opacity={0.45} />
          <circle cx={nodeX} cy={mid} r={5} fill={nodeColor} />
        </>
      ) : isBranchTip ? (
        <>
          <circle cx={nodeX} cy={mid} r={5.4} fill="var(--panel)" stroke={nodeColor} strokeWidth={2.4} />
          <path
            d={`M ${nodeX - 2.3} ${mid - 1} L ${nodeX} ${mid + 1.6} L ${nodeX + 2.3} ${mid - 1}`}
            fill="none"
            stroke={nodeColor}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : isMerge ? (
        <>
          <circle cx={nodeX} cy={mid} r={5} fill="var(--panel)" stroke={nodeColor} strokeWidth={2.2} />
          <circle cx={nodeX} cy={mid} r={2} fill={nodeColor} />
        </>
      ) : (
        <circle cx={nodeX} cy={mid} r={4.2} fill={nodeColor} />
      )}
    </svg>
  )
}

function DecorationChips({
  decorations,
  max = 4,
  compact = false
}: {
  decorations: string
  max?: number
  compact?: boolean
}) {
  const chips = parseDecorations(decorations)
  if (chips.length === 0) return null
  const visible = chips.slice(0, max)
  const hidden = chips.slice(max)
  const more = hidden.length
  return (
    <>
      {visible.map((chip, index) => (
        <span
          key={`${chip.text}-${index}`}
          className={cn(
            'shrink-0 truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-3.5',
            compact ? 'max-w-[96px]' : 'max-w-[128px]',
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
        <span
          className="shrink-0 rounded border border-[var(--border)] bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]"
          title={hidden.map((chip) => chip.text).join('\n')}
        >
          +{more}
        </span>
      ) : null}
    </>
  )
}
