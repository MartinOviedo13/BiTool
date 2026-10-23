# PLAN DE MEJORAS — Lavadero BI (TRITÓN / Poseidón Servicio de Lavandería SRL)

Proyecto de tesis de Analista de Sistemas (IRESM) — Sistema de Business Intelligence, Portal B2B con trazabilidad QR, Auditoría Operativa y Asistente IA para **Poseidón Servicio de Lavandería SRL (TRITÓN)**.

---

## PARTE 1 — Auditoría de Seguridad, Concurrencia y Deuda Técnica (RESUELTOS)

### 🔴 Críticos / Seguridad (Resueltos)

- ✅ **P1. Configuración de IA y Sanitización de Secretos (`.env.example` / `ia.go` / `gemini.go`):**
  - Se eliminaron contraseñas reales en `.env.example` (`tu_password_readonly`).
  - Se actualizó el modelo por defecto a `gemini-2.5-flash` (modelo oficial estable).
  - Se implementó validación Fail-Fast al inicio del servidor (`main.go`) exigiendo `DATABASE_URL` y `JWT_SECRET` de al menos 32 caracteres, eliminando todos los secretos hardcodeados de fallback en `middleware.go` y `main.go`.
  - En `askIA` se valida que `GEMINI_API_KEY` esté definida sin espacios residuales y se registra el código de estado ante fallos del proveedor externo.
- ✅ **P2. CORS seguro configurable por entorno (`routes.go` / `middleware.go`):**
  - Se reemplazó el comodín inseguro `*` por lectura dinámica de `CORS_ALLOWED_ORIGINS` (separada por comas, con fallback seguro a `http://localhost:5173` y `http://127.0.0.1:5173`), habilitando `Access-Control-Allow-Credentials: true` y cabecera `Vary: Origin`.
- ✅ **P3. Autenticación JWT y Control de Acceso Basado en Roles (RBAC):**
  - Implementado y testeado con middlewares `requireAuth` y `requireRole` para los perfiles `admin`, `operario`, `cliente` y `repartidor`.

### 🟠 Integridad de Datos, Transacciones y Mapeo de Errores (Resueltos)

- ✅ **P4. Validación de Foreign Keys y traducción centralizada de errores PostgreSQL (`respond.go`):**
  - Se implementó el helper centralizado `writeDBError` que inspecciona `pgx.ErrNoRows` (`404 Not Found`) y códigos `*pgconn.PgError`: `23503` (`422 Unprocessable Entity` cuando el hotel o ítem no existe), `23505` (`409 Conflict` por duplicados) y `23514` (`400 Bad Request` por violación de `CHECK`).
- ✅ **P5. Distinción semántica en CRUD de Registros, Hoteles e Ítems (`registros.go`, `hoteles.go`, `items.go`):**
  - Todos los handlers CRUD utilizan `writeDBError`, distinguiendo recursos inexistentes (`404`) de conflictos (`409`) y referencias inválidas (`422`).
- ✅ **P6. Unicidad `(hotel_id, item_id, fecha)`, `UPSERT` idempotente y carga por lote transaccional (`010_registros_unique_upsert.sql`, `registros.go`):**
  - Nueva migración `010_registros_unique_upsert.sql` que deduplica registros históricos conservando el `MAX(id)` y añade la restricción `uq_registros_hotel_item_fecha UNIQUE (hotel_id, item_id, fecha)`.
  - `createRegistro` y `createRegistrosBatch` operan con `UPSERT` idempotente (`ON CONFLICT (hotel_id, item_id, fecha) DO UPDATE`) dentro de una transacción explícita (`tx.Begin` / `defer tx.Rollback`) combinada con `pgx.Batch` para eliminar consultas N+1.

### 🟡 Arquitectura, Rendimiento, Tipado y Testing (Resueltos)

- ✅ **P7. Timeouts HTTP completos y Graceful Shutdown (`cmd/api/main.go`):**
  - Configurados `ReadHeaderTimeout: 5s`, `ReadTimeout: 15s`, `WriteTimeout: 30s` e `IdleTimeout: 60s`.
  - Apagado elegante (`signal.NotifyContext` con `os.Interrupt` y `syscall.SIGTERM`) drenando conexiones activas con timeout de 10 segundos antes de cerrar el pool de PostgreSQL.
- ✅ **P8. Optimización O(1) del matcher de hoteles e ítems en importación Excel (`services/excel.go`, `import_service.go`, `registros.go`):**
  - `CatalogMatcher` indexa nombres y códigos pre-normalizados en memoria (`map[string]int`) para búsquedas en O(1), ejecutando similitud difusa (subcadenas y distancia de Levenshtein) únicamente como fallback y cacheando el resultado en el mapa para el resto de la planilla.
- ✅ **P9. Eliminación de Race Conditions en la Matriz de Carga (`MatrixEntryView.tsx`) y sesión SPA sin recargas (`client.ts`, `AuthContext.tsx`, `App.tsx`):**
  - Control de timers por celda (`useRef<Map<string, ReturnType<typeof setTimeout>>>`) y cancelación de peticiones en vuelo por celda (`useRef<Map<string, AbortController>>`), limpiando recursos al desmontar.
  - Manejo de `401 Unauthorized` mediante evento global `CustomEvent('auth:unauthorized')` sin recargar el navegador, y persistencia de la pestaña activa en `window.location.hash`.
- ✅ **P10. Erradicación total de `any` en TypeScript (`frontend/src/`):**
  - Tipado 100% estricto en cliente HTTP, contextos y vistas (`npx tsc --noEmit` sin errores ni usos de `any`).
- ✅ **P11. Suite de Tests Unitarios en Go y Contenedorización Docker:**
  - Tests automatizados en `services/excel_test.go`, `handlers/middleware_test.go`, `handlers/alertas_test.go` y `handlers/conciliacion_test.go`.
  - Portabilidad multiplataforma en `frontend/package.json` (sin dependencias nativas `@esbuild/win32-x64`) y `backend/go.mod`.
  - `backend/Dockerfile` multi-stage y `docker-compose.yml` con `postgres:16-alpine` (healthcheck) y backend API.
  - Higiene de archivos de diseño y scripts en `docs/` usando rutas relativas (`pathlib.Path`).

---

## PARTE 2 — Funcionalidades Implementadas y Operativas

- ✅ **Dashboard BI Ejecutivo:** KPIs con variación porcentual vs. período anterior, ranking de hoteles, tendencia temporal, exportación CSV y panel de alertas automáticas (relavado > 5%, roturas > 2%, tarifario sin precio, facturación cero, concentración ≥ 50% e inactividad).
- ✅ **Matriz de Carga Diaria e Importador Excel/IA:** Grilla interactiva con auto-guardado libre de condiciones de carrera, importación masiva con `excelize` y extracción multimodal con Gemini.
- ✅ **Circuito Operativo de Conciliación de Remitos, Notificaciones y Entregas (`011_conciliacion_despachos_notificaciones.sql`, `conciliacion.go`, `MatrixEntryView.tsx`, `EntregasView.tsx`, `Navbar.tsx`):**
  - Validación de remito desde la Matriz de Carga comparando ítems y totales declarados en remito vs. procesados en planta (`validado_ok` o `validado_con_diferencia`).
  - Generación transaccional de notificaciones operativas para perfiles `cliente`, `repartidor` y `admin` con muestra estructurada ítem por ítem (`muestra_procesado`).
  - Centro de Notificaciones en tiempo real en `Navbar` (campana con contador de no leídas, tabla desplegable de diferencias y marcado de lectura).
  - Vista de Logística / Entregas (`EntregasView`) con alerta preventiva de diferencias, inspección de muestra procesada y confirmación de entrega en destino con bloqueo automático de fila en la Matriz.
- ✅ **Portal B2B Clientes & Trazabilidad QR:** Emisión de remitos digitales con código QR único (`ENV-...`), compartición por WhatsApp, Ficha 360 del Hotel y exportación de liquidaciones.
- ✅ **Auditoría de Planta:** Cruce automático entre lo declarado por el hotel y lo contado en lavadero (prendas limpias, en relavado y rotas/bajas).
- ✅ **Asistente IA (`LLMProvider`):** Consultas en lenguaje natural sobre métricas agregadas sin exposición directa de SQL.
