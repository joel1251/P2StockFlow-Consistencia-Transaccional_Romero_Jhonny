$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)
function Check { if($LASTEXITCODE -ne 0){throw "Error del comando anterior: $LASTEXITCODE"} }
if(!(Test-Path '../resultados/pruebas.json')){throw 'No existe el registro de integracion previo.'}
$data=Get-Content '../resultados/pruebas.json' -Raw | ConvertFrom-Json
$testedAt=[DateTimeOffset]::Parse($data.date)
foreach($service in @('db','app')){
  $container=docker compose ps -q $service
  Check
  if(!$container){throw "No esta ejecutandose $service."}
  $started=docker inspect --format '{{.State.StartedAt}}' $container
  Check
  Write-Host "$service iniciado en $started (pruebas: $($data.date))"
  if([DateTimeOffset]::Parse($started) -lt $testedAt){throw "No se ha comprobado el reinicio posterior a las pruebas de $service. Ejecute docker compose --progress plain restart db app y vuelva a intentar."}
}
Write-Host 'Comprobando durabilidad sin repetir las pruebas de integracion...'
node scripts/verify-durability.mjs | Tee-Object -FilePath '../resultados/durabilidad.txt'
Check
Write-Host 'Generando respaldo PostgreSQL...'
docker compose exec -T db pg_dump -U stockflow -d stockflow -Fc -f /tmp/BD_RomeroLopezJhonnyJoel.backup
Check
docker compose cp db:/tmp/BD_RomeroLopezJhonnyJoel.backup database/BD_RomeroLopezJhonnyJoel.backup
Check
$restoreDb='stockflow_restore_'+(Get-Date -Format 'yyyyMMddHHmmss')
Write-Host "Restaurando en $restoreDb..."
docker compose exec -T db createdb -U stockflow $restoreDb
Check
docker compose exec -T db pg_restore -U stockflow -d $restoreDb --no-owner /tmp/BD_RomeroLopezJhonnyJoel.backup
Check
$sql='SELECT json_build_object(''products'',(SELECT count(*) FROM products),''warehouses'',(SELECT count(*) FROM warehouses),''inventory'',(SELECT count(*) FROM inventory),''orders'',(SELECT count(*) FROM orders),''stock_total'',(SELECT sum(quantity_in_stock) FROM inventory))'
$original=docker compose exec -T db psql -U stockflow -d stockflow -Atc $sql
Check
$restored=docker compose exec -T db psql -U stockflow -d $restoreDb -Atc $sql
Check
if($original -ne $restored){throw 'La base restaurada no coincide con la original.'}
$restoration=@{base=$restoreDb;original=($original | ConvertFrom-Json);restaurada=($restored | ConvertFrom-Json);coincide=$true}
$restoration | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath '../resultados/restauracion.json' -Encoding UTF8
Write-Host "Restauracion comprobada: $restored"
try {
  if(!(Test-Path 'database/stockflow_database_original.sql')){Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/Husseinalmoadhen/StockFlow-Inventory-System/main/stockflow_database.sql' -OutFile 'database/stockflow_database_original.sql' -TimeoutSec 30}
  if(!(Test-Path 'database/LICENSE_StockFlow.txt')){Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/Husseinalmoadhen/StockFlow-Inventory-System/main/LICENSE' -OutFile 'database/LICENSE_StockFlow.txt' -TimeoutSec 30}
} catch { Write-Warning 'No fue posible descargar la referencia. Falta descargar el SQL original y su licencia.' }
if((Test-Path '../informe/plantilla.html') -and (Test-Path 'scripts/generate-report.mjs')){node scripts/generate-report.mjs; Check}
Write-Host 'Durabilidad, respaldo y restauracion completados. Informe actualizado.'
