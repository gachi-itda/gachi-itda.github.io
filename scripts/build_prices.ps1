# Master CSV -> Google Sheets unit price DB + config VERSION
param(
    [string]$MasterPath = (Join-Path $PSScriptRoot '..\data\prices\2026-H2.csv'),
    [string]$Version    = '',
    [string]$OutDir     = (Join-Path $PSScriptRoot '..\output'),
    [string]$TemplatesDir = (Join-Path $PSScriptRoot '..\templates'),
    [switch]$SkipConfigUpdate
)

$ErrorActionPreference = 'Stop'

function Read-JsonFile([string]$path) {
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Escape-CsvField([string]$s) {
    if ($null -eq $s) { return '""' }
    $s = [string]$s
    if ($s -match '[",\r\n]') { return '"' + ($s -replace '"', '""') + '"' }
    return $s
}

function Resolve-Cat([string]$group, [string]$subGroup, $groupMap) {
    if ($subGroup -and $groupMap.platformCat.subGroupPrefix) {
        foreach ($prefix in $groupMap.platformCat.subGroupPrefix.PSObject.Properties) {
            if ($subGroup.StartsWith($prefix.Name, [System.StringComparison]::OrdinalIgnoreCase)) {
                return [string]$prefix.Value
            }
        }
    }
    if ($group -and $groupMap.platformCat.groupOverride.$group) {
        return [string]$groupMap.platformCat.groupOverride.$group
    }
    if ($groupMap.building.$group) { return [string]$groupMap.building.$group }
    return $group
}

function Format-Spec([string]$name, [string]$spec) {
    $name = ($name -replace '\s+', ' ').Trim()
    $spec = ($spec -replace '\s+', ' ').Trim()
    if (-not $spec -or $spec -eq '-') { return $name }
    return "$name ($spec)"
}

function Normalize-Unit([string]$unit, $unitMap) {
    $u = ($unit -replace '\s+', '').Trim().ToLowerInvariant()
    if ($unitMap.map.$u) { return [string]$unitMap.map.$u }
    return $unit.Trim()
}

function Format-Note([string]$code, [string]$laborRate, [string]$matExclude, [string]$userNote, $labels) {
    $parts = New-Object System.Collections.Generic.List[string]
    if ($code) { $parts.Add($code) | Out-Null }
    $lrNum = 0.0
    if ([double]::TryParse($laborRate, [ref]$lrNum)) {
        $pct = [math]::Round($lrNum * 100)
        $parts.Add("$($labels.laborPrefix)${pct}%") | Out-Null
    }
    $mx = ($matExclude -eq 'TRUE' -or $matExclude -eq 'True' -or $matExclude -eq '1')
    $parts.Add($(if ($mx) { $labels.matExclude } else { $labels.matInclude })) | Out-Null
    if ($userNote) { $parts.Add($userNote) | Out-Null }
    return ($parts -join ' | ')
}

$dataDir = Join-Path $PSScriptRoot '..\data\prices'
$masterFull = [System.IO.Path]::GetFullPath($MasterPath)
$groupMap = Read-JsonFile (Join-Path $dataDir 'group-map.json')
$unitMap = Read-JsonFile (Join-Path $dataDir 'unit-map.json')
$labels = Read-JsonFile (Join-Path $dataDir 'build-labels.json')
$outputNames = Read-JsonFile (Join-Path $dataDir 'build-output.json')

$rows = Import-Csv -LiteralPath $masterFull -Encoding UTF8
if (-not $rows -or $rows.Count -eq 0) { throw "Master CSV is empty: $masterFull" }

if (-not $Version) {
    $Version = ($rows | Where-Object { $_.version } | Select-Object -First 1 -ExpandProperty version)
}
if (-not $Version) { throw 'Version not set. Pass -Version or include version column in master.' }

$activeRows = @($rows | Where-Object {
    $a = ([string]$_.active).Trim().ToUpperInvariant()
    $a -ne 'N' -and $a -ne 'NO' -and $a -ne '0'
})

$header = 'id,version,cat,spec,unit,price,region_factor,active,note'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add($header) | Out-Null

$id = 1
foreach ($r in $activeRows) {
    $cat = Resolve-Cat $r.group $r.subGroup $groupMap
    $spec = Format-Spec $r.name $r.spec
    $unit = Normalize-Unit $r.unit $unitMap
    $note = Format-Note $r.code $r.laborRate $r.matExclude $r.note $labels
    $line = @(
        $id,
        (Escape-CsvField $Version),
        (Escape-CsvField $cat),
        (Escape-CsvField $spec),
        (Escape-CsvField $unit),
        $r.price,
        '1.0',
        'Y',
        (Escape-CsvField $note)
    ) -join ','
    $lines.Add($line) | Out-Null
    $id++
}

$outDirFull = [System.IO.Path]::GetFullPath($OutDir)
$templatesFull = [System.IO.Path]::GetFullPath($TemplatesDir)
foreach ($dir in @($outDirFull, $templatesFull)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

$outFiles = @(
    (Join-Path $outDirFull $outputNames.outputFile),
    (Join-Path $templatesFull $outputNames.templatesFile)
)

$utf8Bom = New-Object System.Text.UTF8Encoding $true
foreach ($outFile in $outFiles) {
    [System.IO.File]::WriteAllLines($outFile, $lines, $utf8Bom)
}

if (-not $SkipConfigUpdate) {
    $configPath = Join-Path $templatesFull $outputNames.configFile
    if (Test-Path $configPath) {
        $cfgLines = Get-Content -LiteralPath $configPath -Encoding UTF8
        $newCfg = New-Object System.Collections.Generic.List[string]
        $versionNote = (Get-Content -LiteralPath $configPath -Encoding UTF8 | Select-Object -Skip 1 -First 1)
        $versionNoteText = '현재 적용 버전 (단가DB version 열과 일치)'
        if ($versionNote -match '^VERSION,[^,]+,(.+)$') { $versionNoteText = $Matches[1] }
        foreach ($cl in $cfgLines) {
            if ($cl -match '^VERSION,') {
                $newCfg.Add("VERSION,$Version,$versionNoteText") | Out-Null
            } else {
                $newCfg.Add($cl) | Out-Null
            }
        }
        [System.IO.File]::WriteAllLines($configPath, $newCfg, $utf8Bom)
        Write-Host "Updated VERSION -> $Version in templates config"
    }
}

Write-Host "Built $($activeRows.Count) items (version $Version)"
Write-Host "  output/sheets unit DB CSV"
Write-Host "  templates/unit DB CSV"

$catGroups = $activeRows | ForEach-Object {
    [PSCustomObject]@{
        cat = Resolve-Cat $_.group $_.subGroup $groupMap
    }
} | Group-Object cat | Sort-Object Name

Write-Host ''
Write-Host 'Categories:'
foreach ($g in $catGroups) {
    Write-Host ("  {0,-20} {1,3} items" -f $g.Name, $g.Count)
}
