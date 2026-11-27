# ============================================================
#  Git管理器 launcher
#  Starts the C++ web server and opens the UI as a browser app.
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
    'Git管理器',
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
    return ($result.version -eq '0.0.2')
  } catch {
    return $false
  }
}

$port = 0
$runtimePid = 0
if (Test-Path $runtime) {
  try {
    $runtimeData = Get-Content $runtime -Raw | ConvertFrom-Json
    $port = [int]$runtimeData.port
    $runtimePid = [int]$runtimeData.pid
  } catch {}
}

if (-not (Test-AppServer $port)) {
  # A previous core crashed or was killed while holding the instance mutex.
  # Stop only that recorded gitcore process, then let a fresh core start.
  if ($runtimePid -gt 0) {
    $stale = Get-Process -Id $runtimePid -ErrorAction SilentlyContinue
    if ($stale -and $stale.ProcessName -eq 'gitcore' -and $stale.Path -eq $core) {
      Write-LauncherLog "stopping stale core pid=$runtimePid"
      Stop-Process -Id $runtimePid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 300
    }
  }
  Remove-Item $runtime -Force -ErrorAction SilentlyContinue
  $port = 0

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

function Start-AppBrowser([string]$exe) {
  $browserArgs = @(
    "--app=$url",
    '--window-size=1460,940',
    '--window-position=80,40',
    '--no-first-run',
    '--no-default-browser-check'
  )
  if ($env:GIT_SWITCHER_DEBUG_PORT) {
    $browserArgs += '--remote-debugging-address=127.0.0.1'
    $browserArgs += "--remote-debugging-port=$($env:GIT_SWITCHER_DEBUG_PORT)"
  }

  Write-LauncherLog "opening $exe $url"
  try {
    $browserProcess = Start-Process -FilePath $exe -ArgumentList $browserArgs -PassThru
    Start-Sleep -Seconds 3
    if (-not $browserProcess.HasExited) {
      Write-LauncherLog "browser running pid=$($browserProcess.Id)"
      return $true
    }
    if ($browserProcess.ExitCode -eq 0) {
      Write-LauncherLog 'browser handed off to existing instance'
      return $true
    }
    Write-LauncherLog "browser exited early: code=$($browserProcess.ExitCode)"
    return $false
  } catch {
    Write-LauncherLog "browser start failed: $($_.Exception.Message)"
    return $false
  }
}

# Edge first: on this machine Chrome can crash (0x80000003) when launched
# from a minimized/hidden parent process. Do not pass --user-data-dir: a
# custom profile makes both Edge and Chrome exit early in this context.
$candidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)

$opened = $false
foreach ($candidate in $candidates) {
  if (-not $candidate -or -not (Test-Path $candidate)) { continue }
  if (Start-AppBrowser $candidate) {
    $opened = $true
    break
  }
}

if (-not $opened) {
  Write-LauncherLog 'no app browser worked, opening default browser'
  # Open the URL through the shell's registered browser handler. Do not start
  # explorer.exe: a second Explorer can fail with 0xc0000142 and block the UI.
  try {
    Start-Process $url | Out-Null
    Write-LauncherLog 'default browser open requested'
  } catch {
    Write-LauncherLog "default browser failed: $($_.Exception.Message)"
  }
}
