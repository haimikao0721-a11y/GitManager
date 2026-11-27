import { useEffect, useRef } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Toasts } from '@/components/Toasts'
import { CommandPalette } from '@/components/CommandPalette'
import { AccountsPage } from '@/pages/AccountsPage'
import { ReposPage } from '@/pages/ReposPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { Button, Card } from '@/components/ui'

const pages = {
  accounts: AccountsPage,
  repos: ReposPage,
  workspace: WorkspacePage,
  settings: SettingsPage
}

export default function App() {
  const config = useAppStore((state) => state.config)
  const loading = useAppStore((state) => state.loading)
  const bootError = useAppStore((state) => state.bootError)
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const workspaceTab = useAppStore((state) => state.workspaceTab)
  const paletteOpen = useAppStore((state) => state.paletteOpen)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const bootstrap = useAppStore((state) => state.bootstrap)
  const scanRepos = useAppStore((state) => state.scanRepos)
  const repos = useAppStore((state) => state.repos)
  const selectedRepoPath = useAppStore((state) => state.selectedRepoPath)
  const refreshRepo = useAppStore((state) => state.refreshRepo)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const didAutoScan = useRef(false)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!config || didAutoScan.current) return
    didAutoScan.current = true
    if (repos.length === 0) scanRepos()
  }, [config, repos.length, scanRepos])

  useEffect(() => {
    if (activePage === 'workspace' && selectedRepoPath) {
      refreshRepo()
      if (workspaceTab === 'history') refreshHistory()
    }
  }, [activePage, refreshHistory, refreshRepo, selectedRepoPath, workspaceTab])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === 'Escape' && paletteOpen) setPaletteOpen(false)
      if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key)) {
        event.preventDefault()
        const target = (['accounts', 'repos', 'workspace', 'settings'] as const)[Number(event.key) - 1]
        setActivePage(target)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [paletteOpen, setActivePage, setPaletteOpen])

  if (!config && loading.bootstrap) {
    return <BootScreen />
  }

  if (!config && bootError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="text-base font-semibold text-[var(--text-strong)]">无法启动核心</h1>
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{bootError}</p>
          <Button variant="primary" className="mt-4" onClick={() => bootstrap()}>
            <RefreshCw className="h-3.5 w-3.5" /> 重试
          </Button>
        </Card>
      </div>
    )
  }

  const Page = pages[activePage] ?? AccountsPage
  const selfScroll = activePage === 'settings' || activePage === 'workspace'

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div key={activePage} className="h-full">
            {selfScroll ? (
              <Page />
            ) : (
              <div className="h-full overflow-y-auto">
                <Page />
              </div>
            )}
          </div>
        </main>
      </div>
      <Toasts />
      <CommandPalette />
    </div>
  )
}

function BootScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg)]">
      <div className="flex flex-col items-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="7" cy="6" r="2.2" fill="currentColor" stroke="none" />
            <circle cx="17" cy="12" r="2.2" fill="currentColor" stroke="none" />
            <circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none" />
            <path d="M7 8.2v7.6" />
            <path d="M7 12h5.5a4.5 4.5 0 0 0 4.5-4.5V9" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-[var(--text-strong)]">Git管理器</div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          启动中
        </div>
      </div>
    </div>
  )
}
