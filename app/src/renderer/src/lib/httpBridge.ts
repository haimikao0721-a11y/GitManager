import type { ElectronApi } from '@/types/global'

let requestId = 1

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = await response.json()
      message = payload.error?.message ?? payload.error ?? message
    } catch {
      // Keep the status code when the body is not JSON.
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function createHttpApi(): ElectronApi {
  const heartbeat = window.setInterval(() => {
    fetch('/app/heartbeat', { method: 'POST', body: '{}' }).catch(() => {})
  }, 5000)
  window.setTimeout(() => {
    fetch('/app/heartbeat', { method: 'POST', body: '{}' }).catch(() => {})
  }, 500)
  window.addEventListener('beforeunload', () => window.clearInterval(heartbeat))

  return {
    invoke: async <T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
      const payload = await post<{
        id: number
        ok: boolean
        result?: T
        error?: { message?: string }
      }>('/rpc', { id: requestId++, method, params })
      if (!payload.ok) throw new Error(payload.error?.message ?? '核心返回未知错误')
      return payload.result as T
    },

    pickFolder: async () => {
      const result = await post<{ path: string }>('/dialog/folder')
      return result.path || null
    },
    pickFile: async () => {
      const result = await post<{ path: string }>('/dialog/file')
      return result.path || null
    },

    openPath: async (target: string) => {
      await post('/app/openPath', { target })
      return ''
    },
    showItemInFolder: async (target: string) => {
      await post('/app/showInFolder', { target })
    },
    openExternal: async (url: string) => {
      await post('/app/openExternal', { url })
    },
    openTerminal: async (target: string) => {
      const result = await post<{ ok: boolean }>('/app/openTerminal', { target })
      return result.ok
    },
    openEditor: async (target: string, editor?: string) => {
      const result = await post<{ ok: boolean }>('/app/openEditor', { target, editor })
      return result.ok
    },

    getVersion: async () => {
      const result = await request<{ version: string }>('/api/version')
      return result.version
    },
    setTheme: async (_theme?: 'dark' | 'light' | 'sepia' | 'system') => {
      // Theme is applied locally with CSS variables.
    },

    window: {
      minimize: async () => {},
      maximize: async () => {},
      close: async () => {
        await post('/app/quit')
      }
    },
    quit: async () => {
      await post('/app/quit')
    },

    onCoreLog: () => () => {}
  }
}

export function installHttpBridge(): void {
  if ((window as any).api) return
  ;(window as any).api = createHttpApi()
}
