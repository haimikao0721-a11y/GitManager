import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function initials(value: string): string {
  const text = (value || '?').trim()
  if (!text) return '?'
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  const first = text.replace(/[^\p{L}\p{N}]/gu, '')
  return (first.slice(0, 2) || '?').toUpperCase()
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••••••' + value.slice(-4)
}

export interface DecorationChip {
  text: string
  kind: 'head' | 'tag' | 'remote' | 'branch'
}

export function parseDecorations(decorations: string): DecorationChip[] {
  let text = (decorations || '').trim()
  if (!text) return []
  if (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1)
  if (!text) return []
  return text
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((token) => {
      if (token.startsWith('tag: ')) return { text: token.slice(5).trim(), kind: 'tag' as const }
      if (token.startsWith('HEAD -> ')) return { text: token.slice(8).trim(), kind: 'head' as const }
      if (/^(origin|upstream)\//.test(token)) return { text: token, kind: 'remote' as const }
      return { text: token, kind: 'branch' as const }
    })
}

export function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

export function shortPath(path: string, max = 48): string {
  if (path.length <= max) return path
  const head = path.slice(0, Math.ceil((max - 3) / 2))
  const tail = path.slice(-Math.floor((max - 3) / 2))
  return `${head}...${tail}`
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

export const GRAPH_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#a16207',
  '#84cc16',
  '#64748b',
  '#0ea5e9',
  '#f97316',
  '#e11d48',
  '#4d7c0f'
]

export function graphColor(index: number): string {
  return GRAPH_COLORS[((index % GRAPH_COLORS.length) + GRAPH_COLORS.length) % GRAPH_COLORS.length]
}
