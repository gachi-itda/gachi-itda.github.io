$src = 'c:\Users\7707f\Downloads\standard_price_2026_H2.csv'
$dst = 'c:\Users\7707f\Downloads\unit_db_sheets_2026_H2.csv'
$rows = Import-Csv $src -Encoding UTF8
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('id,version,cat,spec,unit,price,region_factor,active,note')
foreach ($r in $rows) {
    $specEsc = $r.spec -replace '"', '""'
    if ($specEsc -match '[,\r\n"]') { $specEsc = "`"$specEsc`"" }
    $note = "노무비율$($r.labor_ratio)%"
    [void]$sb.AppendLine("$($r.id),$($r.version),$($r.cat),$specEsc,$($r.unit),$($r.price),1.0,$($r.active),$note")
}
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($dst, $sb.ToString(), $utf8Bom)
Write-Output "OK: $($rows.Count) rows -> $dst"
