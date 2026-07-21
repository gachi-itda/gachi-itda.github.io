# data/prices/_seed-2026-H2.tsv → data/prices/2026-H2.csv
# TSV columns: code, group, subGroup, name, spec, unit, price, laborRate, matExclude, note, updatedAt
param(
    [string]$SeedPath = (Join-Path $PSScriptRoot '..\data\prices\_seed-2026-H2.tsv'),
    [string]$OutPath  = (Join-Path $PSScriptRoot '..\data\prices\2026-H2.csv'),
    [string]$Version  = '2026-H2'
)

function Escape-CsvField([string]$s) {
    if ($null -eq $s) { return '""' }
    $s = $s.Trim()
    if ($s -match '[",\r\n]') { return '"' + ($s -replace '"', '""') + '"' }
    return $s
}

$header = 'code,group,subGroup,name,spec,unit,price,laborRate,matExclude,note,version,active,updatedAt'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add($header) | Out-Null

$seedFull = [System.IO.Path]::GetFullPath($SeedPath)
$outFull = [System.IO.Path]::GetFullPath($OutPath)
$raw = Get-Content -LiteralPath $seedFull -Encoding UTF8

foreach ($line in $raw) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $cols = $line -split "`t"
    if ($cols[0] -eq 'code' -or [string]::IsNullOrWhiteSpace($cols[0])) { continue }

    $code       = $cols[0].Trim()
    $group      = $cols[1].Trim()
    $subGroup   = $cols[2].Trim()
    $name       = $cols[3].Trim()
    $spec       = if ($cols.Count -gt 4) { $cols[4].Trim() } else { '-' }
    $unit       = $cols[5].Trim()
    $price      = ($cols[6] -replace ',', '').Trim()
    $laborRate  = $cols[7].Trim()
    $matExclude = $cols[8].Trim()
    $note       = if ($cols.Count -gt 9) { $cols[9].Trim() } else { '' }
    $updatedAt  = if ($cols.Count -gt 10) { $cols[10].Trim() } else { '2026-05-07' }

    $row = @(
        (Escape-CsvField $code),
        (Escape-CsvField $group),
        (Escape-CsvField $subGroup),
        (Escape-CsvField $name),
        (Escape-CsvField $spec),
        (Escape-CsvField $unit),
        $price,
        $laborRate,
        $matExclude,
        (Escape-CsvField $note),
        $Version,
        'Y',
        $updatedAt
    ) -join ','
    $lines.Add($row) | Out-Null
}

$outDir = Split-Path $outFull -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($outFull, $lines, $utf8Bom)
Write-Host "Wrote $($lines.Count - 1) rows -> $outFull"
