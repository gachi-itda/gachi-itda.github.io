param(
    [string]$SourcePath = 'D:\200_cursor\scripts\building_2026_H2_source.txt',
    [string]$OutCsv = 'c:\Users\7707f\Downloads\standard_price_2026_H2.csv',
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'parse_standard_price_config.json')
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$cp949 = [Text.Encoding]::GetEncoding(949)

$config = [System.IO.File]::ReadAllText($ConfigPath, $utf8) | ConvertFrom-Json
$CatMap = @{}; $config.buildingCatMap.PSObject.Properties | ForEach-Object { $CatMap[$_.Name] = $_.Value }
$UnitMap = [ordered]@{}; $config.unitMap.PSObject.Properties | ForEach-Object { $UnitMap[$_.Name] = $_.Value }

$CAT_WORD = -join @([char]0xB300, [char]0xBD84, [char]0xB958)
$CODE_HDR = -join @([char]0xACF5, [char]0xC885, [char]0xCF54, [char]0xB4DC)

function Normalize-Spaces([string]$s) {
    if ($null -eq $s) { return '' }
    $s = ($s -replace '[ \t\r\n]+', ' ').Trim()
    $prev = $null
    while ($prev -ne $s) {
        $prev = $s
        $s = [regex]::Replace($s, '([\uAC00-\uD7A3])\s+([\uAC00-\uD7A3])', '$1$2')
    }
    return $s.Trim()
}

function Normalize-Unit([string]$u) {
    $u = (Normalize-Spaces $u).ToLower()
    $u = $u.Replace([string][char]0x33A1, 'm2').Replace([string][char]0x33A5, 'm3')
    if ($UnitMap.Contains($u)) { return $UnitMap[$u] }
    if ($u.StartsWith('nr')) { return 'EA' }
    return $u.ToUpper()
}

function Parse-Price([string]$s) {
    $digits = -join ([regex]::Matches($s, '\d') | ForEach-Object { $_.Value })
    if ($digits) { return [int64]$digits } else { return 0 }
}

function Parse-Labor([string]$s) {
    if ($s -match '(\d+)') { return $Matches[1] }
    return ''
}

function Map-Cat([string]$letter, [string]$rawName) {
    if ($CatMap.ContainsKey($letter)) { return $CatMap[$letter] }
    $name = [regex]::Replace((Normalize-Spaces $rawName), '[^0-9A-Za-z\uAC00-\uD7A3]', '')
    if ($name) { return $name } else { return $letter }
}

function Is-Code([string]$s) {
    return [bool]((Normalize-Spaces $s) -match '^[A-Z]{2}[A-Z0-9]{2,}\.[0-9]{5,}$')
}

function Build-SpecFull([string]$name, [string]$spec) {
    $name = Normalize-Spaces $name
    $spec = Normalize-Spaces $spec
    if ($spec -and $spec -ne '-') { return "$name ($spec)" }
    return $name
}

function Is-PriceCell([string]$s) {
    $s = Normalize-Spaces $s
    return [bool]($s -match '^[\d,]+$' -and $s -match '\d')
}

function Is-LaborCell([string]$s) {
    $s = Normalize-Spaces $s
    return [bool]($s -match '^\d+\s*%?\s*$')
}

function Try-ParseRecord([string[]]$cells, [int]$startIdx) {
    $code = Normalize-Spaces $cells[$startIdx]
    if (-not (Is-Code $code)) { return $null }
    if (($startIdx + 4) -ge $cells.Count) { return $null }

    $name = $cells[$startIdx + 1]
    $specParts = New-Object System.Collections.Generic.List[string]
    $k = $startIdx + 2
    $unit = $null
    $priceRaw = $null
    $laborRaw = $null

    while ($k -lt ($cells.Count - 2)) {
        if ((Is-PriceCell $cells[$k + 1]) -and (Is-LaborCell $cells[$k + 2])) {
            $unit = $cells[$k]
            $priceRaw = $cells[$k + 1]
            $laborRaw = $cells[$k + 2]
            break
        }
        [void]$specParts.Add($cells[$k])
        $k++
    }
    if (-not $unit) { return $null }

    return @{
        code      = $code
        spec_full = (Build-SpecFull $name (($specParts -join ' ')))
        unit      = (Normalize-Unit $unit)
        price     = (Parse-Price $priceRaw)
        labor     = (Parse-Labor $laborRaw)
        nextIdx   = $k + 2
    }
}

if (-not (Test-Path $SourcePath)) { throw "Source not found: $SourcePath" }

$raw = [System.IO.File]::ReadAllText($SourcePath, $cp949)
$cells = $raw -split "`r" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }

$currentCat = ''
$allRows = New-Object System.Collections.Generic.List[object]
$seenCodes = @{}

for ($i = 0; $i -lt $cells.Count; $i++) {
    $norm = Normalize-Spaces $cells[$i]

    if ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])\s*(.*)$") {
        $letter = $Matches[1]
        $rest = $Matches[2]
        if (-not $rest) {
            if (($i + 1) -lt $cells.Count) {
                $rest = $cells[$i + 1]
                $i++
            }
        }
        $currentCat = Map-Cat $letter $rest
        continue
    }

    if ($norm -eq $CODE_HDR) { continue }
    if (-not (Is-Code $norm)) { continue }
    if (-not $currentCat) { continue }
    if ($seenCodes.ContainsKey($norm)) { continue }

    $rec = Try-ParseRecord $cells $i
    if (-not $rec) { continue }

    $seenCodes[$rec.code] = $true
    [void]$allRows.Add([pscustomobject]@{
        code        = $rec.code
        cat         = $currentCat
        spec_full   = $rec.spec_full
        unit        = $rec.unit
        price       = $rec.price
        labor_ratio = $rec.labor
    })
    $i = $rec.nextIdx - 1
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('id,cat,spec,unit,price,labor_ratio,version,active')
$idx = 1
foreach ($r in $allRows) {
    $specEsc = $r.spec_full -replace '"', '""'
    if ($specEsc -match '[,\r\n"]') { $specEsc = "`"$specEsc`"" }
    [void]$sb.AppendLine("$idx,$($r.cat),$specEsc,$($r.unit),$($r.price),$($r.labor_ratio),2026-H2,Y")
    $idx++
}

$utf8Bom = New-Object System.Text.UTF8Encoding $true
$outDir = Split-Path $OutCsv -Parent
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
[System.IO.File]::WriteAllText($OutCsv, $sb.ToString(), $utf8Bom)

Write-Output "OK: $($allRows.Count) rows -> $OutCsv"
$allRows | Group-Object cat | Sort-Object Count -Descending | ForEach-Object {
    Write-Output "  $($_.Name): $($_.Count)"
}
