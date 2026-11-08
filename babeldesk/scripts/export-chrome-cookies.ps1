# Exporta cookies de Chrome a data/cookies.txt (Netscape) para yt-dlp.
# Cierra Chrome antes (Administrador de tareas -> chrome.exe).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root "data\cookies.txt"
New-Item -ItemType Directory -Force -Path (Join-Path $root "data") | Out-Null

$browser = $env:YTDLP_COOKIES_FROM_BROWSER
if (-not $browser) { $browser = "chrome" }

Write-Host "Exportando cookies ($browser) -> $out"
Write-Host "Antes: inicia sesion en youtube.com en Chrome, reproduce un video, CIERRA Chrome del todo."

$testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
yt-dlp --cookies-from-browser $browser --cookies $out --skip-download $testUrl

if (-not (Test-Path $out)) {
  Write-Host "ERROR: no se creo cookies.txt. Cierra chrome.exe o usa extension Get cookies.txt LOCALLY en youtube.com."
  exit 1
}

$lines = Get-Content $out | Where-Object { $_ -notmatch "^\s*#" -and $_.Trim() -ne "" }
$ytSessionNames = @("LOGIN_INFO", "SID", "__Secure-1PSID", "__Secure-3PSID", "SAPISID")
$found = @()
foreach ($name in $ytSessionNames) {
  if ($lines | Where-Object { $_ -match "\t$name\t" }) { $found += $name }
}

$n = (Get-Item $out).Length
if ($found.Count -eq 0) {
  Write-Host ""
  Write-Host "AVISO: cookies.txt ($n bytes) pero SIN sesion de YouTube (solo visitante)."
  Write-Host "  -> Chrome abierto al exportar, perfil equivocado, o no logueado en YouTube."
  Write-Host ""
  Write-Host "Plan B (recomendado):"
  Write-Host "  1) Chrome logueado en https://www.youtube.com"
  Write-Host "  2) Extension 'Get cookies.txt LOCALLY' -> Export en esa pestana"
  Write-Host "  3) Guardar como: $out"
  exit 2
}

Write-Host "OK: cookies.txt ($n bytes). YouTube sesion: $($found -join ', ')"
Write-Host "Siguiente: npm run dev -> Mis Videos -> Descargar"
