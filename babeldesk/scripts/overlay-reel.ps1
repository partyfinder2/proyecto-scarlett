# Prueba manual ffmpeg reel 9:16 (sin Electron)
param(
  [Parameter(Mandatory = $true)][string]$InFile,
  [string]$Hook = "Sunset in Puerto Vallarta",
  [switch]$NoBranding
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot + "\.."
npm run build | Out-Null

$out = [System.IO.Path]::ChangeExtension($InFile, $null).TrimEnd(".")
$out = "$out-reel.mp4"

node --import tsx -e @"
import { exportReel } from './src/media/overlay.ts';
const r = await exportReel({
  inFile: process.argv[1],
  outFile: process.argv[2],
  hook: process.argv[3],
  showBranding: process.argv[4] !== '0',
});
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
"@ $InFile $out $Hook ($(if ($NoBranding) { '0' } else { '1' }))

Write-Host "Salida: $out"
