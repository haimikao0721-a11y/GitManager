export interface ElectronApi {
  invoke<T = any>(method: string, params?: Record<string, unknown>): Promise<T>
  pickFolder(): Promise<string | null>
  pickFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  openPath(target: string): Promise<string>
  showItemInFolder(target: string): Promise<void>
  openExternal(url: string): Promise<void>
  openTerminal(target: string): Promise<boolean>
  openEditor(target: string, editor?: string): Promise<boolean>
  getVersion(): Promise<string>
  setTheme(theme: 'dark' | 'light' | 'sepia' | 'system'): Promise<void>
  quit(): Promise<void>
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
  }
  onCoreLog(callback: (line: string) => void): () => void
}

declare global {
  interface Window {
    api: ElectronApi
  }
}

export {}
