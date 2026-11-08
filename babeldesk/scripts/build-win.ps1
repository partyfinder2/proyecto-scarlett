# Empaqueta BabelDesk sin firma de código (uso personal).
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Set-Location $PSScriptRoot + "\.."
npm run build
npm run build:win
Write-Host ""
Write-Host "Instalador: dist\BabelDesk Setup.exe"
Write-Host "Portable:   dist\BabelDesk-Portable-0.2.0.exe"
