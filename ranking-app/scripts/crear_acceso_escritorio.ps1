$base = Split-Path $PSScriptRoot -Parent
$vbs = Join-Path $base "scripts\abrir_ranking.vbs"
$ico = Join-Path $base "assets\ranking_app.ico"
$desk = [Environment]::GetFolderPath("Desktop")
$nombre = "Rankings Scarlett"
$lnk = Join-Path $desk "$nombre.lnk"
$viejo = Join-Path $desk "Ranking App.lnk"
if (Test-Path $viejo) { Remove-Item $viejo -Force }

$sh = New-Object -ComObject WScript.Shell
$sc = $sh.CreateShortcut($lnk)
$sc.TargetPath = "C:\Windows\System32\wscript.exe"
$sc.Arguments = "`"$vbs`""
$sc.WorkingDirectory = $base
$sc.IconLocation = "$ico,0"
$sc.Description = "Rankings Scarlett — videos Top verticales para TikTok e Instagram"
$sc.WindowStyle = 1
$sc.Save()

Write-Host "Acceso directo creado: $lnk"
