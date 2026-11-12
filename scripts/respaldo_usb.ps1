# Respaldo a USB cuando Pablo la conecte.
# No incluye node_modules, .next ni caches: eso se regenera.
# Si incluye .env locales: la USB es privada, no se presta.
$ErrorActionPreference = "Stop"

$fecha = Get-Date -Format "yyyy-MM-dd"
$venuz = "C:\Users\pablo\Downloads\VENUZ-Complete-App"
$babel = "C:\Users\pablo\Downloads\BabelDesk"
$scarlett = Join-Path $venuz "metodo-scarlett"
$repo = Join-Path $venuz "venuz-repo"

$usb = $null
if (Test-Path "D:\") { $usb = "D:\" }
if (-not $usb) {
  $removibles = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2"
  if ($removibles) { $usb = $removibles[0].DeviceID + "\" }
}
if (-not $usb) {
  Write-Host "No hay USB conectada. Conecta la memoria y vuelve a correr este script."
  exit 1
}

$destino = Join-Path $usb "PROYECTO VENUZ\Respaldo-$fecha"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Write-Host "Copiando a $destino"

Set-Location $scarlett
git bundle create (Join-Path $destino "proyecto-scarlett-$fecha.bundle") --all
Set-Location $repo
git bundle create (Join-Path $destino "partyfinder-$fecha.bundle") --all

$excluir = @("node_modules", ".next", "cache", "__pycache__", ".venv", "venv")
robocopy $scarlett (Join-Path $destino "proyecto-scarlett") /E /NFL /NDL /NJH /NJS /XD $excluir | Out-Null
robocopy $repo (Join-Path $destino "venuz-repo") /E /NFL /NDL /NJH /NJS /XD $excluir | Out-Null
if (Test-Path $babel) {
  robocopy $babel (Join-Path $destino "BabelDesk") /E /NFL /NDL /NJH /NJS /XD @("node_modules") | Out-Null
}

@"
Respaldo $fecha
- proyecto-scarlett: BabelDesk (codigo), Ranking y Fabrica
- partyfinder-2.0: VENUZ / LabelBabel
- BabelDesk de todos los dias: carpeta BabelDesk (sin node_modules)
Los videos exportados de Ranking van en proyecto-scarlett\ranking-app\output.
Esta USB puede tener archivos .env. No prestarla.
"@ | Set-Content (Join-Path $destino "LEEME.txt") -Encoding UTF8

Write-Host "Listo: $destino"
