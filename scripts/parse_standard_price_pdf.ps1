param(
    [string]$SourcePath = 'D:\200_cursor\scripts\standard_price_2026_H2_source.txt',
    [string]$OutCsv = 'D:\200_cursor\scripts\standard_price_2026_H2.csv',
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'parse_standard_price_config.json')
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$cp949 = [Text.Encoding]::GetEncoding(949)

$config = [System.IO.File]::ReadAllText($ConfigPath, $utf8) | ConvertFrom-Json
$BuildingCatMap = @{}; $config.buildingCatMap.PSObject.Properties | ForEach-Object { $BuildingCatMap[$_.Name] = $_.Value }
$CivilCatMap = @{}; $config.civilCatMap.PSObject.Properties | ForEach-Object { $CivilCatMap[$_.Name] = $_.Value }
$UnitMap = [ordered]@{}; $config.unitMap.PSObject.Properties | ForEach-Object { $UnitMap[$_.Name] = $_.Value }

$CH_CIVIL = -join @([char]0xD1A0, [char]0xBAA9)
$CH_BUILD = -join @([char]0xAC74, [char]0xCD95)
$CH_MECH = -join @([char]0xAE30, [char]0xACC4)
$CH2 = -join @([char]0xC81C, [char]0x32, [char]0xC7A5)
$CH3 = -join @([char]0xC81C, [char]0x33, [char]0xC7A5)
$CH4 = -join @([char]0xC81C, [char]0x34, [char]0xC7A5)
$CAT_WORD = -join @([char]0xB300, [char]0xBD84, [char]0xB958)
$CODE_HDR = -join @([char]0xACF5, [char]0xC885, [char]0xCF54, [char]0xB4DC)
$CH2_FULL = "$CH2\s+$CH_CIVIL"
$CH3_FULL = "$CH3\s+$CH_BUILD"
$CH4_FULL = "$CH4\s+$CH_MECH"

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

function Get-CatMap([string]$chapter) {
    if ($chapter -eq $CH_BUILD) { return $BuildingCatMap }
    if ($chapter -eq $CH_CIVIL) { return $CivilCatMap }
    return @{}
}

function Map-Cat([string]$chapter, [string]$letter, [string]$rawName) {
    $rawName = Normalize-Spaces $rawName
    $map = Get-CatMap $chapter
    if ($map.ContainsKey($letter)) { return $map[$letter] }
    $name = [regex]::Replace($rawName, '[^0-9A-Za-z\uAC00-\uD7A3]', '')
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

function Get-CatAtIndex([string[]]$cells, [int]$idx, [string]$chapter) {
    $lastLetter = ''
    $lastName = ''
    for ($j = 0; $j -le $idx; $j++) {
        $norm = Normalize-Spaces $cells[$j]
        if ($norm -match $CH2_FULL) { $chapter = $CH_CIVIL; continue }
        if ($norm -match $CH3_FULL) { $chapter = $CH_BUILD; continue }
        if ($norm -match $CH4_FULL) { $chapter = $CH_MECH; continue }
        if ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])\s*(.*)$") {
            $lastLetter = $Matches[1]
            $lastName = $Matches[2]
            if (-not $lastName -and ($j + 1) -lt $cells.Count) { $lastName = Normalize-Spaces $cells[$j + 1] }
        } elseif ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])$") {
            $lastLetter = $Matches[1]
            $lastName = if (($j + 1) -lt $cells.Count) { Normalize-Spaces $cells[$j + 1] } else { '' }
        }
    }
    if ($lastLetter) { return Map-Cat $chapter $lastLetter $lastName }
    return ''
}

function Update-Markers([string[]]$cells, [int]$idx, [ref]$chapter, [ref]$currentCat) {
    $norm = Normalize-Spaces $cells[$idx]

    if ($norm -match $CH2_FULL) { $chapter.Value = $CH_CIVIL; return }
    if ($norm -match $CH3_FULL) { $chapter.Value = $CH_BUILD; return }
    if ($norm -match $CH4_FULL) { $chapter.Value = $CH_MECH; return }
    if ($norm -match "<\s*$([regex]::Escape($CH_CIVIL))") { $chapter.Value = $CH_CIVIL; return }
    if ($norm -match "<\s*$([regex]::Escape($CH_BUILD))") { $chapter.Value = $CH_BUILD; return }
    if ($norm -match "<\s*$([regex]::Escape($CH_MECH))") { $chapter.Value = $CH_MECH; return }

    if ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])\s*(.*)$") {
        $currentCat.Value = Map-Cat $chapter.Value $Matches[1] $Matches[2]
        return
    }
    if ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])$") {
        $catName = if (($idx + 1) -lt $cells.Count) { $cells[$idx + 1] } else { '' }
        $currentCat.Value = Map-Cat $chapter.Value $Matches[1] $catName
    }
}


$raw = [System.IO.File]::ReadAllText($SourcePath, $cp949)
$cells = $raw -split "`r" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }

$chapter = $CH_CIVIL
$currentCat = ''
$allRows = New-Object System.Collections.Generic.List[object]
$seenCodes = @{}

for ($i = 0; $i -lt $cells.Count; $i++) {
    $cell = $cells[$i]
    $norm = Normalize-Spaces $cell

    Update-Markers $cells $i ([ref]$chapter) ([ref]$currentCat) | Out-Null
    if ($norm -match $CH2_FULL -or $norm -match $CH3_FULL -or $norm -match $CH4_FULL) { continue }
    if ($norm -match "<\s*$([regex]::Escape($CH_CIVIL))" -or $norm -match "<\s*$([regex]::Escape($CH_BUILD))" -or $norm -match "<\s*$([regex]::Escape($CH_MECH))") { continue }
    if ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])") { if ($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])$") { $i++ }; continue }

    if ($norm -eq $CODE_HDR) { continue }
    if (-not (Is-Code $norm)) { continue }
    if (-not $currentCat) { continue }
    if ($seenCodes.ContainsKey($norm)) { continue }

    $rec = Try-ParseRecord $cells $i
    if (-not $rec) { continue }

    $rowCat = Get-CatAtIndex $cells $i $chapter
    if (-not $rowCat) { $rowCat = $currentCat }

    $seenCodes[$rec.code] = $true
    [void]$allRows.Add([pscustomobject]@{
        code        = $rec.code
        cat         = $rowCat
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
[System.IO.File]::WriteAllText($OutCsv, $sb.ToString(), $utf8Bom)

Write-Output "OK: $($allRows.Count) rows -> $OutCsv"
$allRows | Group-Object cat | Sort-Object Count -Descending | Select-Object -First 25 | ForEach-Object {
    Write-Output "  $($_.Name): $($_.Count)"
}
