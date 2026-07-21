# Code_final.gs -> gas/Code.gs (clasp push 용)
$src = Join-Path $PSScriptRoot '..\Code_final.gs'
$dst = Join-Path $PSScriptRoot '..\gas\Code.gs'
if (-not (Test-Path $src)) { throw "Source not found: $src" }
Copy-Item -LiteralPath $src -Destination $dst -Force
Write-Host "Synced -> gas/Code.gs"
