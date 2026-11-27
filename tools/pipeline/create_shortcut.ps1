param(
  [string]$Root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [string]$Name = 'Git管理器',
  [string]$OutDir = ([Environment]::GetFolderPath('Desktop'))
)

$appExe = Join-Path $Root 'Git管理器.exe'
$launcher = Join-Path $Root '启动.ps1'
$shortcutPath = Join-Path $OutDir "$Name.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

if (Test-Path $appExe) {
  $shortcut.TargetPath = $appExe
  $shortcut.Arguments = ''
  $shortcut.WorkingDirectory = $Root
  $shortcut.IconLocation = "$appExe,0"
} elseif (Test-Path $launcher) {
  $shortcut.TargetPath = 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $launcher
  $shortcut.WorkingDirectory = $Root
  $shortcut.WindowStyle = 7
  $coreExe = Join-Path $Root 'gitcore.exe'
  $appIcon = Join-Path $Root 'assets\app.ico'
  if (Test-Path $coreExe) {
    $shortcut.IconLocation = "$coreExe,0"
  } elseif (Test-Path $appIcon) {
    $shortcut.IconLocation = "$appIcon,0"
  }
} else {
  throw "Launcher not found in $Root"
}

$shortcut.Description = 'Git管理器'
$shortcut.Save()
Write-Output $shortcutPath
