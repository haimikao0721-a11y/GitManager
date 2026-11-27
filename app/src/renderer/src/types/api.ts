export type Theme = 'dark' | 'light' | 'sepia'
export type PageId = 'accounts' | 'repos' | 'workspace' | 'settings'
export type WorkspaceTab = 'changes' | 'history'
export type AuthType = 'https' | 'ssh'

export interface Account {
  id: string
  name: string
  githubUser: string
  gitName: string
  email: string
  httpsUser: string
  sshHost: string
  sshKey: string
  defaultOwner: string
  note: string
  authType: AuthType
  isDefault: boolean
}

export interface Settings {
  theme: Theme
  confirmDestructive: boolean
  editor: string
  terminal: string
  historyLimit: number
}

export interface AppConfig {
  version: number
  scanRoots: string[]
  accounts: Account[]
  settings: Settings
  updatedAt?: string
}

export interface GitInfo {
  installed: boolean
  version: string
  path: string
}

export interface SystemInfo {
  version: string
  configPath: string
  dataDir: string
  platform: string
  arch: string
  cwd: string
  home: string
  git: GitInfo
}

export interface RepoInfo {
  path: string
  name: string
  branch: string
  detached: boolean
  remoteName: string
  url: string
  protocol: string
  host: string
  owner: string
  repo: string
  isGitHub: boolean
  accountId: string
  accountName: string
  lastCommitHash: string
  lastCommitDate: string
  lastCommitSubject: string
  dirty: boolean
  ahead: number
  behind: number
  hasConflicts?: boolean
  userName: string
  userEmail: string
  identityMismatch: boolean
}

export interface StatusFile {
  xy: string
  path: string
  displayPath: string
  label: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
  hidden?: boolean
}

export interface RepoStatus {
  branch: string
  upstream: string
  ahead: number
  behind: number
  files: StatusFile[]
  hasConflicts: boolean
  error?: string
}

export interface DiffResult {
  diff: string
  error?: string
}

export interface RepoLockStatus {
  exists: boolean
  path: string
  ageMs: number
  held: boolean
  stale: boolean
  activeGit: number
  writable: boolean
  writeError: number
  error?: string
}

export interface ClearLockResult {
  cleared: boolean
  backup?: string
  message?: string
}

export interface Branch {
  refName: string
  shortName: string
  type: 'local' | 'remote'
  upstream: string
  hash: string
  date: string
  subject: string
  isCurrent: boolean
}

export interface BranchesResult {
  branches: Branch[]
  current: string
  upstream?: string
  error?: string
}

export interface LaneRef {
  lane: number
  color: number
}

export interface HistoryRow {
  hash: string
  parents: string[]
  date: string
  author: string
  decorations: string
  subject: string
  lane: number
  color: number
  nodeFromTop: boolean
  nodeToBottom: boolean
  through: LaneRef[]
  incoming: LaneRef[]
  outgoing: LaneRef[]
  maxLane: number
}

export interface HistoryResult {
  rows: HistoryRow[]
  count: number
  shown: number
  filterLabel: string
  current: string
  upstream: string
  limit: number
  error?: string
}

export interface Stash {
  ref: string
  index: number
  message: string
  date: string
}

export interface StashesResult {
  stashes: Stash[]
  count: number
  error?: string
}

export interface Remote {
  name: string
  url: string
}

export interface Credential {
  target: string
  userName: string
  type: string
  rawType?: number
  persisted: string
  comment: string
  lastWritten: string
  isGitHub: boolean
  secret?: string
}

export interface SshKey {
  name: string
  path: string
  type: string
  comment: string
  publicKey: string
}

export interface SshInfo {
  sshDir: string
  configPath: string
  configText: string
  keys: SshKey[]
  privateKeys: Array<{ name: string; path: string }>
}

export interface GitHubUser {
  login: string
  name: string
  id: number
  avatarUrl: string
  htmlUrl: string
  publicRepos: number
  totalPrivateRepos: number
}

export interface GitHubRepo {
  id: number
  name: string
  fullName: string
  private: boolean
  description: string
  cloneUrl: string
  sshUrl: string
  defaultBranch: string
  updatedAt: string
  owner: { login: string; avatarUrl: string }
}

export interface GitProxyState {
  http: string
  https: string
}

export interface SystemProxyState {
  enabled: boolean
  server: string
  autoConfig: string
  rawEnabled: number
}

export interface ToastItem {
  id: number
  title: string
  description?: string
  kind: 'success' | 'error' | 'info'
}
