<#
.SYNOPSIS
  Installs the houdinimcp add-on into a Houdini user preferences folder.
.EXAMPLE
  .\install.ps1 -HoudiniVersion 21.0
  .\install.ps1 -HoudiniVersion 22.0 -AutoStart
.NOTES
  -AutoStart also installs uiready.py (starts the listener when Houdini's UI opens).
  An existing uiready.py is never overwritten; append the contents by hand instead.
#>
param(
    [Parameter(Mandatory)][string]$HoudiniVersion,   # e.g. 20.5, 21.0, 22.0
    [string]$PrefDir,                                 # override, default ~/Documents/houdini<ver>
    [switch]$AutoStart
)
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'houdini_addon'
if (-not $PrefDir) { $PrefDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "houdini$HoudiniVersion" }
if (-not (Test-Path $PrefDir)) { throw "Houdini pref dir not found: $PrefDir (launch Houdini $HoudiniVersion once, or pass -PrefDir)" }

Copy-Item (Join-Path $src 'scripts') $PrefDir -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $PrefDir 'toolbar') | Out-Null
Copy-Item (Join-Path $src 'toolbar\houdinimcp.shelf') (Join-Path $PrefDir 'toolbar') -Force
Write-Host "Installed add-on + MCP shelf into $PrefDir"

if ($AutoStart) {
    # Python lib folder name follows Houdini's bundled Python: 20.5/21.0 -> 3.11, 22.0 -> 3.13
    $py = if ([version]$HoudiniVersion -ge [version]'22.0') { '3.13' } else { '3.11' }
    $libs = Join-Path $PrefDir "python${py}libs"
    New-Item -ItemType Directory -Force $libs | Out-Null
    $dst = Join-Path $libs 'uiready.py'
    if (Test-Path $dst) { Write-Warning "$dst exists; not overwritten. Merge houdini_addon\uiready.py by hand." }
    else { Copy-Item (Join-Path $src 'uiready.py') $dst; Write-Host "Auto-start installed: $dst" }
}
Write-Host "Next: restart Houdini, click 'Start MCP' on the MCP shelf (unless -AutoStart), then register bridge\houdini_mcp.py with Claude (see README)."
