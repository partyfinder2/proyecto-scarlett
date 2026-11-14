# Respaldo a USB — carpeta nueva por fecha (no borra respaldos anteriores).
# Uso: .\respaldo_usb.ps1   o desde actualizar_y_respaldo.ps1
param(
    [string]$UsbRaiz = "",
    [string]$Fecha = "",
    [hashtable]$Manifiesto = $null
)

$ErrorActionPreference = "Stop"
if (-not $Fecha) { $Fecha = Get-Date -Format "yyyy-MM-dd" }
$mes = Get-Date -Format "yyyy-MM"

$venuz = "C:\Users\pablo\Downloads\VENUZ-Complete-App"
$babel = "C:\Users\pablo\Downloads\BabelDesk"
$scarlett = Join-Path $venuz "metodo-scarlett"
$repo = Join-Path $venuz "venuz-repo"

function Find-UsbRoot {
    param([string]$Override)
    if ($Override -and (Test-Path $Override)) { return $Override.TrimEnd("\") + "\" }
    foreach ($letra in @("D","E","F","G","H","I","J","K")) {
        $p = "${letra}:\"
        if (Test-Path $p) {
            $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$letra`:'" -ErrorAction SilentlyContinue
            if ($disk -and $disk.DriveType -eq 2) { return $p }
        }
    }
    $rem = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2" -ErrorAction SilentlyContinue
    if ($rem) { return $rem[0].DeviceID + "\" }
    return $null
}

$usb = Find-UsbRoot -Override $UsbRaiz
if (-not $usb) {
    Write-Host ""
    Write-Host "No hay USB conectada."
    Write-Host "Conecta la memoria y vuelve a ejecutar:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$scarlett\scripts\actualizar_y_respaldo.ps1`""
    Write-Host ""
    Write-Host "También puedes indicar la letra:  -UsbRaiz E:\"
    exit 1
}

# Misma carpeta padre siempre; hijo con fecha (mes a mes ves Respaldo-2026-10-01, Respaldo-2026-11-14, etc.)
$baseUsb = Join-Path $usb "PROYECTO VENUZ"
$destino = Join-Path $baseUsb "Respaldo-$Fecha"
if (Test-Path $destino) {
    $destino = Join-Path $baseUsb "Respaldo-$Fecha-" + (Get-Date -Format "HHmm")
}
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Write-Host "Copiando a $destino (no se borran respaldos viejos en $baseUsb)"

Push-Location $scarlett
git bundle create (Join-Path $destino "proyecto-scarlett-$Fecha.bundle") --all 2>$null
if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo crear bundle scarlett (¿git?)" }
Pop-Location

Push-Location $repo
git bundle create (Join-Path $destino "partyfinder-$Fecha.bundle") --all 2>$null
if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo crear bundle partyfinder" }
Pop-Location

$excluir = @(
    "node_modules", ".next", "cache", "__pycache__", ".venv", "venv",
    "ranking-app\cache\thumbs", "ranking-app\cache\previews", "ranking-app\cache\test_*"
)
robocopy $scarlett (Join-Path $destino "proyecto-scarlett") /E /NFL /NDL /NJH /NJS /XD $excluir | Out-Null
robocopy $repo (Join-Path $destino "venuz-repo") /E /NFL /NDL /NJH /NJS /XD $excluir | Out-Null
if (Test-Path $babel) {
    robocopy $babel (Join-Path $destino "BabelDesk") /E /NFL /NDL /NJH /NJS /XD node_modules dist out | Out-Null
}

$readme = @"
Respaldo $Fecha (mes $mes)
==========================
- proyecto-scarlett  → Rankings, Fábrica, código BabelDesk en repo
- venuz-repo         → Partyfinder 2.0 / LabelBabel (GitHub partyfinder-2.0)
- BabelDesk          → copia de uso diario en Downloads (sin node_modules)

GitHub:
  https://github.com/partyfinder2/proyecto-scarlett
  https://github.com/partyfinder2/partyfinder-2.0

Vercel producción: https://labelbabel.com (repo partyfinder-2.0)
Supabase: migraciones en venuz-repo/supabase; proyecto venuz-scraper en dashboard Supabase

Bundles .bundle = historial git completo por si algún día pierdes la carpeta.

Esta USB puede incluir archivos .env — no prestarla.
"@
$readme | Set-Content (Join-Path $destino "LEEME.txt") -Encoding UTF8

if ($Manifiesto) {
    ($Manifiesto | ConvertTo-Json -Depth 5) | Set-Content (Join-Path $destino "MANIFIESTO.json") -Encoding UTF8
}

Write-Host "Listo: $destino"
Get-ChildItem $baseUsb -Directory | Sort-Object Name | ForEach-Object { Write-Host "  - $($_.Name)" }