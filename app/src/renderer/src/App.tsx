import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react'
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

class PageErrorBoundary extends Component<
  { children: ReactNode; pageKey: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page render failed', error, info)
  }

  componentDidUpdate(previous: { pageKey: string }) {
    if (previous.pageKey !== this.props.pageKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <Card className="max-w-lg p-6">
            <div className="mb-3 flex items-center gap-2 text-[var(--danger)]">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold">页面加载出错</span>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">
              {this.state.error.message}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => this.setState({ error: null })}>
                重试
              </Button>
              <Button variant="primary" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3.5 w-3.5" /> 重新加载
              </Button>
            </div>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const config = useAppStore((state) => state.config)
  const loading = useAppStore((state) => state.loading)
  const bootError = useAppStore((state) => state.bootError)
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
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
      refreshHistory()
    }
  }, [activePage, refreshHistory, refreshRepo, selectedRepoPath])

  useEffect(() => {
    let timer = 0
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const state = useAppStore.getState()
        if (state.activePage !== 'workspace' || !state.selectedRepoPath) return
        if (state.loading.mutation) return
        void state.refreshRepo({ history: true })
      }, 450)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === 'Escape' && paletteOpen) setPaletteOpen(false)
      if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key)) {
        event.preventDefault()
        const target = (['repos', 'workspace', 'accounts', 'settings'] as const)[Number(event.key) - 1]
        setActivePage(target)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [paletteOpen, setActivePage, setPaletteOpen, toggleSidebar])

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
          <PageErrorBoundary pageKey={activePage}>
            <div key={activePage} className="h-full">
              {selfScroll ? (
                <Page />
              ) : (
                <div className="h-full overflow-y-auto">
                  <Page />
                </div>
              )}
            </div>
          </PageErrorBoundary>
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
