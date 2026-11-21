# StockFlow Inventory | Taller de consistencia transaccional
Jhonny Joel Romero López · Aplicaciones Distribuidas · ESPE · NRC 32820

## Tecnología y alcance
Node.js 22, PostgreSQL 18, cliente psql, HTML/CSS/JS y Docker Compose. No hay dependencias npm. Se adapta el modelo de [StockFlow Inventory](https://github.com/Husseinalmoadhen/StockFlow-Inventory-System), MIT, al movimiento entre bodegas con cuatro tablas: products, warehouses, inventory y orders. La referencia incluye nueve tablas; esta adaptación reduce el alcance, conserva identificadores y cantidades e incorpora origen, destino, cantidad y responsable a orders. No se usa el trigger comercial de order_items porque el flujo es un traslado (no una compra). El script adaptado incluye datos académicos propios.

## Ejecutar con Docker
1. Requisitos: Docker Desktop iniciado, Docker Compose y puerto 4300 libre.
2. Cree un archivo `.env` local (no incluir en Git/ZIP) con `POSTGRES_PASSWORD=<contraseña elegida>`.
3. Ejecute `docker compose up --build -d`.
4. Abra http://localhost:4300. El servicio externo se inicia en otro contenedor.
5. Para ver logs: `docker compose logs -f app external`.
No requiere cuenta: responsable de prueba es Jhonny Romero. El Proxy identifica y valida el responsable; no es autenticación.

## Alternativa local (PostgreSQL y Node instalados)
Crear una base vacía `stockflow` y ejecutar con psql: `psql -d stockflow -f database/01_stockflow_adaptado.sql`. Configure PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD y PSQL (ruta de psql si no está en PATH). Los valores por defecto son 127.0.0.1, 55432, stockflow, postgres y psql. En dos terminales: `npm run external` y `npm start`. Variables adicionales: PORT (4300), EXTERNAL_URL (http://127.0.0.1:4301), EXTERNAL_PORT (4301). No publicar estos servicios de demostración fuera del entorno local.

## Pruebas
- CRUD: crear un producto, seleccionar la fila, editar y desactivar (eliminación lógica).
- COMMIT: transferir 2 Laptop de Central a Norte. Consultar ambas existencias y orders.
- ROLLBACK: repetir la operación con botón Simular ROLLBACK. La excepción ocurre después de insertar y actualizar; comprobar que no cambia inventario ni órdenes. Las secuencias de ID pueden avanzar aun con rollback.
- Consistencia: intentar transferir más unidades que el stock; también cantidad cero. Confirmar que no hay stock negativo, destino inexistente ni FK inválida.
- Concurrencia: en datos iniciales Monitor tiene una sola unidad en Central. Seleccione Monitor, Central, Norte, 1. Pulse Dos clientes concurrentes o envíe desde dos pestañas. Un COMMIT y un ROLLBACK; stock 0 en Central y 1 en Norte. Para repetir, traslade la unidad de vuelta.
- Durabilidad: anote un ID confirmado; `docker compose restart app db`, espere la disponibilidad y consulte el mismo ID. El volumen dbdata conserva los datos.
- Proxy: pruebe responsable vacío e identifique PROXY en los eventos. No hay llamada real de movimiento cuando falla la validación.
- Observer: cada COMMIT produce AUDITORÍA y NOTIFICACIÓN; ningún evento de confirmación para rollback.
- Adapter: convierte product/quantity a articleCode/units y resultCode/ticket a approved/reference.
- Circuit Breaker: pulse Provocar fallo; realice 3 movimientos en menos de 5 segundos. Observe OPEN, consulte llamadas y vuelva a intentar inmediatamente (el contador no aumenta). Pulse Recuperar servicio, espere al menos 5 segundos y pruebe nuevamente: en eventos HALF-OPEN y CLOSED. Si la prueba falla, vuelve a OPEN.
- `npm test` ejecuta pruebas unitarias de patrones.

## Parte B - Excepciones y códigos HTTP
La clase `AppError` define un código HTTP, un código de aplicación y el mensaje. El handler central devuelve `status`, `code`, `message`, `requestId`, `transaction` y `circuit`. La identificación se incluye también en el encabezado `X-Request-Id`. Los errores internos no exponen información técnica al cliente.

Ejecutar `./scripts/verificar-errores.ps1` después de las pruebas de la Parte A: reconstruye únicamente el servicio app, verifica respuestas HTTP 400, 404, 409 y 503, recupera el circuito y comprueba que no existan cambios de productos, inventario ni órdenes. Registra los resultados en `../resultados/errores_http.json`. La prueba del error inesperado 500 es unitaria y no detiene el servicio.

Para automatizar las pruebas de integración, reinicio y respaldo desde una instalación Docker en Windows, ejecutar `powershell -ExecutionPolicy Bypass -File scripts/verificar-docker.ps1`. Guarda los resultados reales en `../resultados/pruebas.json` y verifica la restauración en otra base de datos.

## Respaldo y restauración
Con Docker, desde la carpeta del proyecto:
```powershell
docker compose exec -T db pg_dump -U stockflow -d stockflow -Fc -f /tmp/BD_RomeroLopezJhonnyJoel.backup
docker compose cp db:/tmp/BD_RomeroLopezJhonnyJoel.backup database/BD_RomeroLopezJhonnyJoel.backup
docker compose cp database/BD_RomeroLopezJhonnyJoel.backup db:/tmp/BD_RomeroLopezJhonnyJoel.backup
docker compose exec db createdb -U stockflow stockflow_restore
docker compose exec db pg_restore -U stockflow -d stockflow_restore --no-owner /tmp/BD_RomeroLopezJhonnyJoel.backup
```
Restaurar en una base nueva evita sobrescribir el entorno. En una instalación local, usar pg_dump -Fc y pg_restore --no-owner con las opciones de conexión habituales.

## Diseño
HTTP -> MovementProxy -> MovementService -> InventoryRepository -> PostgreSQL. MovementService usa TransportAdapter -> CircuitBreaker -> servicio HTTP de transporte y, tras COMMIT, EventBus -> AuditObserver y NotificationObserver.
SRP: controlador HTTP, repositorios, servicio, adaptador y observadores separados. OCP: registrar otro observador sin editar MovementService. LSP: ambos observadores reciben notify(event) y pueden reemplazarse. ISP: contratos de movimiento, producto, autorización y notificación separados. DIP: MovementService recibe repositorio, autorización y bus en constructor.

