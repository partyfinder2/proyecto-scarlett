$base = Split-Path $PSScriptRoot -Parent
$vbs = Join-Path $base "scripts\abrir_fabrica.vbs"
$ico = Join-Path $base "assets\fabrica.ico"
if (-not (Test-Path $ico)) {
  $ico = Join-Path $env:SystemRoot "System32\shell32.dll,13"
}

$desk = Join-Path $env:USERPROFILE "OneDrive\Escritorio"
if (-not (Test-Path $desk)) {
  $desk = [Environment]::GetFolderPath("Desktop")
}

$nombre = "Fabrica de Contenido"
$lnk = Join-Path $desk "$nombre.lnk"
$viejo = Join-Path $desk "Fábrica de Contenido.lnk"
if (Test-Path $viejo) { Remove-Item $viejo -Force }

$sh = New-Object -ComObject WScript.Shell
$sc = $sh.CreateShortcut($lnk)
$sc.TargetPath = "C:\Windows\System32\wscript.exe"
$sc.Arguments = "`"$vbs`""
$sc.WorkingDirectory = $base
$sc.IconLocation = $ico
$sc.Description = "Fábrica de Contenido — vídeos con voz, guion y envío a BabelDesk"
$sc.WindowStyle = 7
$sc.Save()

Write-Host "Acceso directo creado: $lnk"
