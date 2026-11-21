$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot)
function Check { if($LASTEXITCODE -ne 0){throw "Error del comando anterior: $LASTEXITCODE"} }
New-Item -ItemType Directory -Force -Path ../resultados | Out-Null
Write-Host 'Parte B - Reconstruyendo solo la aplicacion; PostgreSQL conserva sus datos.'
docker compose --progress plain up --build -d --no-deps app
Check
$ready=$false
for($i=0;$i -lt 30;$i++){
  try { Invoke-RestMethod http://127.0.0.1:4300/api/state -TimeoutSec 5 -ErrorAction Stop | Out-Null; $ready=$true; break } catch { Start-Sleep 2 }
}
if(!$ready){throw 'La aplicacion no respondio.'}
npm test | Tee-Object -FilePath ../resultados/pruebas_unitarias_parte_b.txt
Check
node scripts/verify-errors.mjs | Tee-Object -FilePath ../resultados/errores_http.txt
Check
if((Test-Path '../informe/plantilla.html') -and (Test-Path 'scripts/generate-report.mjs')){
  node scripts/generate-report.mjs
  Check
  $zip=Join-Path (Resolve-Path ..) 'Proyecto_RomeroLopezJhonnyJoel.zip'
  Compress-Archive -Path src,public,database,scripts,package.json,package-lock.json,Dockerfile,docker-compose.yml,README.md,test -DestinationPath $zip -Force
}
Write-Host 'Parte B verificada. El inventario y las ordenes permanecen intactos.'
