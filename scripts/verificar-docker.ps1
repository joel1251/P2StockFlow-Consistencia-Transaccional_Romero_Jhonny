$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot)
function Check { if($LASTEXITCODE -ne 0){throw "Falló el comando anterior: $LASTEXITCODE"} }
function Wait-App {
  for($i=0;$i -lt 40;$i++){
    try { Invoke-RestMethod http://127.0.0.1:4300/api/state -ErrorAction Stop | Out-Null; return } catch { Start-Sleep 2 }
  }
  throw 'La aplicación no respondió después de esperar su inicio.'
}
if(!(Test-Path .env)){
  $secret=[Guid]::NewGuid().ToString('N')
  Set-Content -LiteralPath .env -Value "POSTGRES_PASSWORD=$secret" -Encoding ascii
}
New-Item -ItemType Directory -Force -Path ../resultados | Out-Null
docker compose up --build -d
Check
Wait-App
npm test | Tee-Object -FilePath ../resultados/pruebas_unitarias.txt
Check
node scripts/verify.mjs | Tee-Object -FilePath ../resultados/integracion.txt
Check
docker compose restart db app
Check
Wait-App
node scripts/verify-durability.mjs | Tee-Object -FilePath ../resultados/durabilidad.txt
Check
docker compose exec -T db pg_dump -U stockflow -d stockflow -Fc -f /tmp/BD_RomeroLopezJhonnyJoel.backup
Check
docker compose cp db:/tmp/BD_RomeroLopezJhonnyJoel.backup database/BD_RomeroLopezJhonnyJoel.backup
Check
$restoreDb='stockflow_restore_'+(Get-Date -Format 'yyyyMMddHHmmss')
docker compose exec -T db createdb -U stockflow $restoreDb
Check
docker compose exec -T db pg_restore -U stockflow -d $restoreDb --no-owner /tmp/BD_RomeroLopezJhonnyJoel.backup
Check
$sql = 'SELECT json_build_object(''products'',(SELECT count(*) FROM products),''warehouses'',(SELECT count(*) FROM warehouses),''inventory'',(SELECT count(*) FROM inventory),''orders'',(SELECT count(*) FROM orders),''stock_total'',(SELECT sum(quantity_in_stock) FROM inventory))'
$original = docker compose exec -T db psql -U stockflow -d stockflow -Atc $sql
Check
$restored = docker compose exec -T db psql -U stockflow -d $restoreDb -Atc $sql
Check
if($original -ne $restored){throw 'La comprobación de la base restaurada no coincide con la original.'}
@{base=$restoreDb;original=($original | ConvertFrom-Json);restaurada=($restored | ConvertFrom-Json);coincide=$true} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ../resultados/restauracion.json -Encoding UTF8
try {
  if(!(Test-Path 'database/stockflow_database_original.sql')){Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Husseinalmoadhen/StockFlow-Inventory-System/main/stockflow_database.sql' -OutFile 'database/stockflow_database_original.sql'}
  if(!(Test-Path 'database/LICENSE_StockFlow.txt')){Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Husseinalmoadhen/StockFlow-Inventory-System/main/LICENSE' -OutFile 'database/LICENSE_StockFlow.txt'}
} catch { Write-Warning 'No fue posible descargar la referencia. Obtenga el script original y la licencia antes de crear el ZIP.' }
Write-Host 'Pruebas, durabilidad y respaldo terminados. Resultados en ../resultados/pruebas.json.'

