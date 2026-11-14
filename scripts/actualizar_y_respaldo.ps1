# Actualiza carpetas locales, alinea con GitHub y copia respaldo fechado a USB (sin borrar respaldos viejos).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\actualizar_y_respaldo.ps1
# Opcional: -SinGit  (solo copia USB)   -SoloGit  (sin USB)
param(
    [switch]$SinGit,
    [switch]$SoloGit,
    [string]$UsbRaiz = ""
)

$ErrorActionPreference = "Stop"
$fecha = Get-Date -Format "yyyy-MM-dd"
$mes = Get-Date -Format "yyyy-MM"
$venuzRoot = "C:\Users\pablo\Downloads\VENUZ-Complete-App"
$scarlett = Join-Path $venuzRoot "metodo-scarlett"
$venuzRepo = Join-Path $venuzRoot "venuz-repo"
$babelDesk = "C:\Users\pablo\Downloads\BabelDesk"
$logDir = Join-Path $env:LOCALAPPDATA "ProyectoVenuz"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "actualizacion-$fecha.log"

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Log "=== Actualización Proyecto Venuz / Scarlett ==="

# --- 1) Alinear repo local con BabelDesk de uso diario ---
$syncBat = Join-Path $scarlett "scripts\sync_babeldesk_repo_a_descargas.bat"
if ((Test-Path $syncBat) -and (Test-Path $babelDesk)) {
    Log "Sincronizando babeldesk repo -> Downloads\BabelDesk"
    & cmd /c "`"$syncBat`""
}

if (-not $SinGit) {
    Log "--- GitHub: proyecto-scarlett ---"
    Push-Location $scarlett
    git fetch origin 2>&1 | ForEach-Object { Log $_ }
    $st = git status -sb
    Log $st
    Pop-Location

    Log "--- GitHub: partyfinder-2.0 (venuz-repo) ---"
    Push-Location $venuzRepo
    git fetch origin 2>&1 | ForEach-Object { Log $_ }
    $st2 = git status -sb
    Log $st2
    Pop-Location
    Log "Si hay cambios sin commit, ejecuta commit+push antes del respaldo o pide al agente 'publica en GitHub'."
}

# --- 2) Manifiesto (sin secretos) ---
$manifest = [ordered]@{
    fecha           = $fecha
    mes             = $mes
    scarlettRemote  = "https://github.com/partyfinder2/proyecto-scarlett"
    venuzRemote     = "https://github.com/partyfinder2/partyfinder-2.0"
    vercelProd      = "https://labelbabel.com (partyfinder-2.0)"
    supabaseNominal = "venuz-scraper (ref jbrmziwosyeructvlvrq); prod migraciones en venuz-repo/supabase"
    notas           = @(
        "Cada respaldo USB va en PROYECTO VENUZ\Respaldo-YYYY-MM-DD (no se borran carpetas anteriores)."
        "No copiar .env a repositorio; en USB puede ir .env local (privado)."
        "Vercel: commits de ops con [skip vercel]; deploy con commit push deploy."
    )
}
Push-Location $scarlett
try { $manifest.scarlettHead = (git rev-parse --short HEAD 2>$null) } catch {}
Pop-Location
Push-Location $venuzRepo
try { $manifest.venuzHead = (git rev-parse --short HEAD 2>$null) } catch {}
Pop-Location

if ($SoloGit) {
    Log "SoloGit: fin (sin USB)."
    $manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $logDir "manifiesto-$fecha.json") -Encoding UTF8
    exit 0
}

# --- 3) Respaldo USB ---
& (Join-Path $scarlett "scripts\respaldo_usb.ps1") -UsbRaiz $UsbRaiz -Fecha $fecha -Manifiesto $manifest