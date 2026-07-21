# Minimal inline trace - paste core logic
. {
$SourcePath = 'D:\200_cursor\scripts\standard_price_2026_H2_source.txt'
$utf8 = New-Object System.Text.UTF8Encoding $false
$cp949 = [Text.Encoding]::GetEncoding(949)
$config = [IO.File]::ReadAllText('D:\200_cursor\scripts\parse_standard_price_config.json', $utf8) | ConvertFrom-Json
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
function Normalize-Spaces([string]$s) { if($null -eq $s){return ''}; return ($s -replace '[ \t\r\n]+', ' ').Trim() }
function Normalize-Unit([string]$u) { $u=(Normalize-Spaces $u).ToLower(); if($UnitMap.Contains($u)){return $UnitMap[$u]}; if($u.StartsWith('nr')){return 'EA'}; return $u.ToUpper() }
function Parse-Price([string]$s) { $d=-join ([regex]::Matches($s,'\d')|%{ $_.Value}); if($d){[int64]$d}else{0} }
function Parse-Labor([string]$s) { if($s -match '(\d+)'){$Matches[1]}else{''} }
function Get-CatMap([string]$chapter) { if($chapter -eq $CH_BUILD){$BuildingCatMap}; elseif($chapter -eq $CH_CIVIL){$CivilCatMap}; else {@{}} }
function Map-Cat([string]$chapter,[string]$letter,[string]$rawName) { $m=Get-CatMap $chapter; if($m.ContainsKey($letter)){return $m[$letter]}; $letter }
function Is-Code([string]$s) { [bool]((Normalize-Spaces $s) -match '^[A-Z]{2}[A-Z0-9]{2,}\.[0-9]{5,}$') }
function Build-SpecFull([string]$name,[string]$spec) { $n=Normalize-Spaces $name; $sp=Normalize-Spaces $spec; if($sp -and $sp -ne '-'){"$n ($sp)"}else{$n} }
function Is-PriceCell([string]$s) { $s=Normalize-Spaces $s; [bool]($s -match '^[\d,]+$' -and $s -match '\d') }
function Is-LaborCell([string]$s) { $s=Normalize-Spaces $s; [bool]($s -match '^\d+\s*%?\s*$') }
function Try-ParseRecord([string[]]$cells,[int]$startIdx) {
    $code=Normalize-Spaces $cells[$startIdx]; if(-not (Is-Code $code)){return $null}
    $name=$cells[$startIdx+1]; $specParts=New-Object Collections.Generic.List[string]; $k=$startIdx+2; $unit=$null
    while($k -lt ($cells.Count-2)) {
        if((Is-PriceCell $cells[$k+1]) -and (Is-LaborCell $cells[$k+2])) { $unit=$cells[$k]; $pr=$cells[$k+1]; $lr=$cells[$k+2]; break }
        [void]$specParts.Add($cells[$k]); $k++
    }
    if(-not $unit){return $null}
    return @{code=$code; spec_full=(Build-SpecFull $name ($specParts -join ' ')); nextIdx=$k+2}
}
function Update-Markers([string[]]$cells,[int]$idx,[ref]$chapter,[ref]$currentCat) {
    $norm=Normalize-Spaces $cells[$idx]
    if($norm -match $CH2_FULL){$chapter.Value=$CH_CIVIL;return}
    if($norm -match $CH3_FULL){$chapter.Value=$CH_BUILD;return}
    if($norm -match $CH4_FULL){$chapter.Value=$CH_MECH;return}
    if($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])\s*(.*)$"){$currentCat.Value=Map-Cat $chapter.Value $Matches[1] $Matches[2]; if($idx -eq 8020){Write-Output "8020 set cat=$($currentCat.Value) ch=$($chapter.Value)"}; return}
    if($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])$"){$cn=if($idx+1 -lt $cells.Count){$cells[$idx+1]}else{''}; $currentCat.Value=Map-Cat $chapter.Value $Matches[1] $cn}
}
$raw=[IO.File]::ReadAllText($SourcePath,$cp949)
$cells=$raw -split "`r"|%{ $_.Trim()}|?{$_ -ne ''}
$chapter=$CH_CIVIL; $currentCat=''; $seen=@{}
for($i=0;$i -lt $cells.Count;$i++) {
    $norm=Normalize-Spaces $cells[$i]
    Update-Markers $cells $i ([ref]$chapter) ([ref]$currentCat)|Out-Null
    if($norm -match $CH2_FULL -or $norm -match $CH3_FULL -or $norm -match $CH4_FULL){continue}
    if($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])"){if($norm -match "^$([regex]::Escape($CAT_WORD))\s+([A-Z])$"){$i++}; continue}
    if($norm -eq $CODE_HDR){continue}
    if(-not (Is-Code $norm)){continue}
    if(-not $currentCat){continue}
    if($seen.ContainsKey($norm)){continue}
    $rec=Try-ParseRecord $cells $i; if(-not $rec){continue}
    for($j=$i+1;$j -lt $rec.nextIdx;$j++){Update-Markers $cells $j ([ref]$chapter) ([ref]$currentCat)|Out-Null}
    $seen[$rec.code]=$true
    if($rec.code -match 'LB451|LH114'){Write-Output "ADD $($rec.code) i=$i cat=$currentCat ch=$chapter"}
    $i=$rec.nextIdx-1
}
}
