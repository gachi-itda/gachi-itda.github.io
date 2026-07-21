$ErrorActionPreference = 'Stop'
$transcript = 'C:\Users\7707f\.cursor\projects\d-200-cursor\agent-transcripts\379066d8-4dbb-4f4e-b0a8-fe1a3176afc6\379066d8-4dbb-4f4e-b0a8-fe1a3176afc6.jsonl'
$out = Join-Path $PSScriptRoot '..\data\prices\_seed-2026-H2.tsv'

$lines = Get-Content -LiteralPath $transcript -Encoding UTF8
$obj = ($lines[138] | ConvertFrom-Json)
$text = $obj.message.content[0].text

# Drop XML-ish wrapper lines
$start = $text.IndexOf("code`tgroup")
if ($start -lt 0) { throw 'Seed header not found in transcript' }
$text = $text.Substring($start)

$rows = New-Object System.Collections.Generic.List[string]
foreach ($row in ($text -split "`n")) {
    $row = $row.TrimEnd("`r")
    if ([string]::IsNullOrWhiteSpace($row)) { continue }
    if ($row -notmatch '^code`t' -and $row -notmatch '^[A-Z0-9]{2,}[\.]' -and $row -notmatch '^MAT_') { continue }
    # Keep only first 11 tab columns (strip trailing empty Excel cells)
    $cols = $row -split "`t", 12
    if ($cols.Count -gt 11) { $row = ($cols[0..10] -join "`t") }
    $rows.Add($row) | Out-Null
}

$dir = Split-Path $out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$rows | Set-Content -LiteralPath $out -Encoding UTF8
Write-Host "Extracted $($rows.Count) rows -> $out"
