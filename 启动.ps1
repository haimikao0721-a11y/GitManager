# ============================================================
#  Git管理器 launcher
#  Starts the C++ web server and opens the UI as a Chrome app.
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$devCore = Join-Path $root 'core\build\gitcore.exe'
$devWeb = Join-Path $root 'app\out\renderer'
$distCore = Join-Path $root 'gitcore.exe'
$distWeb = Join-Path $root 'web'

if ((Test-Path $devCore) -and (Test-Path (Join-Path $devWeb 'index.html'))) {
  $core = $devCore
  $web = $devWeb
  $data = Join-Path $root 'core\build\data'
} elseif ((Test-Path $distCore) -and (Test-Path (Join-Path $distWeb 'index.html'))) {
  $core = $distCore
  $web = $distWeb
  $data = Join-Path $root 'data'
} else {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "找不到 gitcore.exe 或 web\index.html。`n请先运行构建脚本。",
    'Git 账户切换器 v2',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
  exit 1
}

New-Item -ItemType Directory -Path $data -Force | Out-Null
$env:GIT_SWITCHER_V2_DATA = $data
$runtime = Join-Path $data 'runtime.json'
$logPath = Join-Path $data 'launcher.log'

function Write-LauncherLog([string]$message) {
  try {
    Add-Content -Path $logPath -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message)
  } catch {}
}

function Test-AppServer([int]$port) {
  if ($port -le 0) { return $false }
  try {
    $result = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/version" -TimeoutSec 1
    return ($result.version -eq '0.0.1')
  } catch {
    return $false
  }
}

$port = 0
if (Test-Path $runtime) {
  try {
    $runtimeData = Get-Content $runtime -Raw | ConvertFrom-Json
    $port = [int]$runtimeData.port
  } catch {}
}

if (-not (Test-AppServer $port)) {
  Write-LauncherLog "starting server: $core"
  $logDir = Join-Path $data 'logs'
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $serverProcess = Start-Process -FilePath $core `
    -ArgumentList @('--serve', '--no-open', '--web-root', $web) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'server.out.log') `
    -RedirectStandardError (Join-Path $logDir 'server.err.log') `
    -PassThru
  Write-LauncherLog "server pid=$($serverProcess.Id)"

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 150
    if ($serverProcess.HasExited) {
      Write-LauncherLog "server exited early: code=$($serverProcess.ExitCode)"
      break
    }
    if (Test-Path $runtime) {
      try {
        $port = [int]((Get-Content $runtime -Raw | ConvertFrom-Json).port)
      } catch {}
      if (Test-AppServer $port) { break }
    }
  }
}

if (-not (Test-AppServer $port)) {
  Write-LauncherLog "server failed to start"
  if (-not $env:GIT_SWITCHER_LAUNCHER_NO_UI) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "C++ 核心启动失败。`n请查看：$logPath`n以及：$(Join-Path $data 'logs\core.log')",
      'Git管理器',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
  }
  exit 1
}

$url = "http://127.0.0.1:$port/"
$profile = Join-Path $data 'browser-profile'
New-Item -ItemType Directory -Path $profile -Force | Out-Null

$browser = $null
$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
)
foreach ($candidate in $candidates) {
  if ($candidate -and (Test-Path $candidate)) {
    $browser = $candidate
    break
  }
}

$browserArgs = @(
  "--app=$url",
  "--user-data-dir=$profile",
  '--window-size=1460,940',
  '--window-position=80,40',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-mode',
  '--disable-component-update',
  '--disable-sync',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-features=Translate,MediaRouter',
  '--metrics-recording-only',
  '--no-service-autorun',
  '--hide-crash-restore-bubble'
)

if ($env:GIT_SWITCHER_DEBUG_PORT) {
  $browserArgs += '--remote-debugging-address=127.0.0.1'
  $browserArgs += "--remote-debugging-port=$($env:GIT_SWITCHER_DEBUG_PORT)"
}

if ($browser) {
  Write-LauncherLog "opening $browser $url"
  Start-Process -FilePath $browser -ArgumentList $browserArgs | Out-Null
} else {
  Write-LauncherLog "browser not found, opening default browser"
  Start-Process $url | Out-Null
}
