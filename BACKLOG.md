# Product & Security Backlog — Lavadero BI (TRITÓN)

Este documento centraliza el backlog integral de tareas, vulnerabilidades corregidas y deuda técnica identificada durante la auditoría **Challenger-Reviewer**.

---

## 📊 Resumen Ejecutivo del Backlog

| Epic | Prioridad | Issues | Estado |
|---|---|---|---|
| **EPIC 1: Hardening de Seguridad & Control Multi-tenant** | 🚨 P0 (Crítico) | SEC-01 a SEC-04 | Pendiente |
| **EPIC 2: Integridad Transaccional & Prevención de Pérdida de Datos** | 🔴 P1 (Alto) | DATA-01 a DATA-03 | Pendiente |
| **EPIC 3: Consistencia de Métricas BI & Conciliación Operativa** | 🟡 P2 (Medio) | BI-01 a BI-02 | Pendiente |
| **EPIC 4: Arquitectura, Normalización de Esquemas & DevOps** | 🟡 P2 (Medio) | ARCH-01 a ARCH-02 | Pendiente |
| **EPIC 5: Optimización de Rendimiento Frontend & Resiliencia SSE** | 🟢 P3 (Bajo) | PERF-01 a PERF-02 | Pendiente |
| **EPIC 6: Experiencia de Desarrollo & Refactorización Modular** | 🟢 P3 (Bajo) | DX-01 a DX-02 | Pendiente |

---

## 🚨 EPIC 1: Hardening de Seguridad & Control Multi-tenant (P0)

### [SEC-01] Autenticación Obligatoria y Restricción de Herramientas en Servidor MCP (`/api/mcp`)
- **Prioridad:** 🚨 P0 - Bloqueante
- **Labels:** `security`, `p0-critical`, `backend`
- **Archivos:** `backend/internal/handlers/app.go`, `backend/internal/handlers/ia.go`, `backend/internal/mcp/tools_bi.go`, `backend/.env.example`
- **Descripción:** Actualmente `/api/mcp` se monta en el grupo público sin autenticación. En `handleMCP`, si `MCP_API_KEY` está vacía o no definida (caso por defecto), se permite la ejecución anónima. La herramienta `query_readonly_sql` admite ejecutar sentencias `SELECT` arbitrarias, lo que permite exfiltrar hashes de contraseñas de la tabla `usuarios` o información confidencial.
- **Criterios de Aceptación:**
  - [ ] El endpoint `/api/mcp` debe rechazar solicitudes sin autenticación (`401 Unauthorized`).
  - [ ] Si `MCP_API_KEY` no está configurada con al menos 32 caracteres, el backend debe fallar al inicio en `main.go`.
  - [ ] La herramienta `query_readonly_sql` debe eliminarse o reemplazarse por vistas específicas sin acceso a tablas de seguridad (`usuarios`, llaves de sistema).
  - [ ] `.env.example` debe incluir la variable `MCP_API_KEY`.

---

### [SEC-02] Mitigación de IDOR Multi-tenant en Remitos y Liquidaciones B2B
- **Prioridad:** 🚨 P0 - Bloqueante
- **Labels:** `security`, `p0-critical`, `backend`
- **Archivos:** `backend/internal/handlers/portal_b2b.go`, `backend/internal/handlers/ficha_hotel.go`
- **Descripción:** Un usuario con rol `cliente` perteneciente a un hotel específico puede consultar el remito de otro hotel vía `GET /api/envios/{id}` y descargar la liquidación mensual de cualquier competidor vía `GET /api/hoteles/{id}/liquidacion/exportar.csv`, simplemente alterando el ID en la URL.
- **Criterios de Aceptación:**
  - [ ] `getEnvioByID` debe comprobar que si el usuario tiene rol `cliente`, `envio.HotelID == *claims.HotelID`. Caso contrario retornar `403 Forbidden`.
  - [ ] `exportarLiquidacionHotelCSV` debe validar que si `claims.Rol == "cliente"`, `hotelID == *claims.HotelID`.
  - [ ] Agregar tests de seguridad automatizados en `handlers/portal_b2b_test.go` verificando el bloqueo de acceso cruzado entre hoteles.

---

### [SEC-03] Endurecimiento de CORS: Eliminación de comodines `.vercel.app` y sanitización LAN
- **Prioridad:** 🚨 P0 - Bloqueante
- **Labels:** `security`, `p0-critical`, `backend`
- **Archivos:** `backend/internal/handlers/middleware.go`
- **Descripción:** El middleware `withCORSOrigins` autoriza cualquier origen que termine en `.vercel.app` o contenga prefijos genéricos como `http://172.` con cabeceras `Access-Control-Allow-Credentials: true`. Esto expone a la aplicación a ataques CSRF/CORS desde sitios maliciosos alojados en Vercel.
- **Criterios de Aceptación:**
  - [ ] Eliminar la comprobación laxa de `isVercel := strings.HasSuffix(origin, ".vercel.app")`.
  - [ ] La lista de orígenes permitidos debe nutrirse exclusivamente de la variable de entorno `CORS_ALLOWED_ORIGINS`.
  - [ ] Si `allowLAN` está activo en modo desarrollo, validar rangos IP privados exactos (192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12) y nunca en producción.

---

### [SEC-04] Seguridad de Sesión: Erradicación de JWT en Query String y soporte de revocación
- **Prioridad:** 🔴 P1 - Alto
- **Labels:** `security`, `p1-high`, `backend`
- **Archivos:** `backend/internal/handlers/middleware.go`, `frontend/src/hooks/useRealtime.ts`
- **Descripción:** El endpoint SSE admite pasar el token JWT por query string `?token=...`, lo cual registra las credenciales en logs de proxy, historial y métricas de red. Además, el JWT tiene una vigencia de 7 días sin mecanismo de revocación cuando un usuario es dado de baja (`activo = false`).
- **Criterios de Aceptación:**
  - [ ] Diseñar mecanismo de ticket temporal de un solo uso (one-time handshake token de 30s) o cookie `HttpOnly` para conexión a SSE.
  - [ ] Verificar `u.activo = true` en base de datos o implementar `token_version` para invalidar sesiones activas de usuarios dados de baja.

---

## 🔴 EPIC 2: Integridad Transaccional & Prevención de Pérdida de Datos (P1)

### [DATA-01] Corrección de borrado accidental de datos en lote: `cantidad = 0` destruye relavados y roturas
- **Prioridad:** 🔴 P1 - Alto
- **Labels:** `bug`, `p1-high`, `backend`, `frontend`
- **Archivos:** `backend/internal/handlers/registros.go`, `frontend/src/components/matrix/MatrixEntryView.tsx`
- **Descripción:** En `createRegistrosBatch`, si un ítem tiene `item.Cantidad == 0`, se encola `DELETE FROM registros WHERE hotel_id = $1 AND item_id = $2 AND fecha = $3`. Si la fila ya tenía registradas prendas en relavado o rotas en auditoría, se eliminan definitivamente del sistema.
- **Criterios de Aceptación:**
  - [ ] Al recibir `cantidad == 0`, ejecutar `UPDATE registros SET cantidad = 0` preservando `cantidad_relavado` y `cantidad_rota`.
  - [ ] Solo eliminar la fila física si `cantidad = 0 AND cantidad_relavado = 0 AND cantidad_rota = 0`.
  - [ ] Test unitario que verifique que actualizar la cantidad limpia a 0 no borre relavados previos.

---

### [DATA-02] Prevención de sobrescritura silenciosa y reseteo de remitos diarios
- **Prioridad:** 🔴 P1 - Alto
- **Labels:** `bug`, `p1-high`, `backend`
- **Archivos:** `backend/internal/handlers/portal_b2b.go`
- **Descripción:** Cuando se emite un remito sin número formal (`numero_remito = ''`), el sistema busca si ya existe un remito para ese hotel y fecha. Si existe, borra todos sus detalles (`DELETE FROM envio_detalles`) y resetea su estado a `listo_para_retiro`, incluso si ya había sido auditado o procesado en planta.
- **Criterios de Aceptación:**
  - [ ] Cada creación de remito debe generar un nuevo registro independiente con su propio código QR unívoco.
  - [ ] Si se permite actualización deliberada (edición de borrador), verificar que el estado sea estrictamente `listo_para_retiro` y no permitir mutar remitos ya `retirados`, `en_planta` o `entregados`.

---

### [DATA-03] Aislamiento de eventos en tiempo real SSE por Hotel (`hotel_id` tenant filter)
- **Prioridad:** 🔴 P1 - Alto
- **Labels:** `security`, `p1-high`, `backend`
- **Archivos:** `backend/internal/handlers/realtime.go`
- **Descripción:** El broker de Server-Sent Events difunde todos los eventos a todos los canales conectados de forma global. Cualquier hotel conectado recibe notificaciones operativas que contienen nombres, prendas y estados de hoteles terceros.
- **Criterios de Aceptación:**
  - [ ] Modificar la estructura de clientes del broker para registrar `{ id, rol, hotel_id }`.
  - [ ] Filtrar en el método `Broadcast`: usuarios con rol `cliente` solo reciben eventos dirigidos a su `hotel_id`.
  - [ ] Roles `admin` y `repartidor` continúan recibiendo todos los eventos logísticos necesarios.

---

## 🟡 EPIC 3: Consistencia de Métricas BI & Conciliación Operativa (P2)

### [BI-01] Corrección del cálculo de prendas relavadas y rotas en Dashboard BI (`analisis.go`)
- **Prioridad:** 🟡 P2 - Medio
- **Labels:** `bug`, `p2-medium`, `backend`
- **Archivos:** `backend/internal/handlers/analisis.go`
- **Descripción:** `resumenGeneral` y `compararPeriodo` calculan la cantidad de relavados asumiendo `CASE WHEN NOT i.se_factura THEN r.cantidad ELSE 0 END`. Esto ignora la columna real `r.cantidad_relavado` (migración 008) y arroja números erróneos si hay ítems no facturables por otra razón.
- **Criterios de Aceptación:**
  - [ ] Reemplazar la consulta en `resumenGeneral` para computar `COALESCE(SUM(r.cantidad_relavado), 0)` como `CantidadRelavado`.
  - [ ] Agregar `COALESCE(SUM(r.cantidad_rota), 0)` como `CantidadRotas`.
  - [ ] Asegurar que las tarjetas del Dashboard y la vista Ficha 360 coincidan de manera exacta.

---

### [BI-02] Coherencia en Conciliación de Despachos Multirremito del mismo día
- **Prioridad:** 🟡 P2 - Medio
- **Labels:** `bug`, `p2-medium`, `backend`
- **Archivos:** `backend/internal/handlers/conciliacion.go`
- **Descripción:** En `validarConciliacion`, se asocia el despacho al remito con `ORDER BY id DESC LIMIT 1`, mientras que la CTE suma las prendas de todos los remitos del día.
- **Criterios de Aceptación:**
  - [ ] Si la conciliación es diaria por hotel, reflejar explícitamente en el modelo que abarca la totalidad de remitos del día.
  - [ ] Exponer la lista de códigos de remito consolidados en el resumen del despacho.

---

## 🟡 EPIC 4: Arquitectura, Normalización de Esquemas & DevOps (P2)

### [ARCH-01] Unificación de Esquema: Eliminar DDL duplicado en Go y centralizar en Goose
- **Prioridad:** 🟡 P2 - Medio
- **Labels:** `enhancement`, `p2-medium`, `backend`
- **Archivos:** `backend/internal/database/database.go`, `backend/migrations/`
- **Descripción:** Funciones como `ensureConciliacionSchema`, `ensureSectoresSchema`, `ensureCostosSchema` ejecutan sentencias DDL en cada inicio de la API, duplicando las migraciones `009` a `015` de Goose.
- **Criterios de Aceptación:**
  - [ ] Consolidar todo cambio de base de datos exclusivamente dentro de la carpeta `backend/migrations/`.
  - [ ] Eliminar los bloques `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE` manuales de `database.go`.

---

### [ARCH-02] Ejecución automática de migraciones Goose en Docker Compose / Dockerfile
- **Prioridad:** 🟡 P2 - Medio
- **Labels:** `devops`, `p2-medium`, `backend`
- **Archivos:** `backend/Dockerfile`, `docker-compose.yml`
- **Descripción:** `docker-compose.yml` levanta PostgreSQL y el backend, pero el contenedor nunca corre las migraciones de Goose. En una máquina limpia, la aplicación falla por tablas inexistentes.
- **Criterios de Aceptación:**
  - [ ] Crear un script `entrypoint.sh` en la imagen de Docker que descargue o ejecute `goose up` antes de iniciar el binario.
  - [ ] Alternativamente, agregar un servicio efímero `migration` en `docker-compose.yml`.
  - [ ] Verificar que `docker compose up` levante un entorno completamente funcional desde cero.

---

## 🟢 EPIC 5: Optimización de Rendimiento Frontend & Resiliencia SSE (P3)

### [PERF-01] Optimización de SSE: Contexto singleton en React y memoización en `RetirosTab`
- **Prioridad:** 🟢 P3 - Bajo
- **Labels:** `enhancement`, `p3-low`, `frontend`
- **Archivos:** `frontend/src/hooks/useRealtime.ts`, `frontend/src/App.tsx`, `frontend/src/components/portal/RetirosTab.tsx`
- **Descripción:** Hay dos conexiones EventSource abiertas en simultáneo. Además, en `RetirosTab`, el callback inline provoca desconexión y reconexión continua del stream ante cualquier renderizado.
- **Criterios de Aceptación:**
  - [ ] Centralizar la conexión SSE en un `RealtimeProvider` único.
  - [ ] Los componentes deben suscribirse a tipos de eventos específicos usando `useCallback` o event emitters desacoplados.

---

### [PERF-02] Code Splitting y optimización de bundle en Frontend (`vite.config.ts` y `React.lazy`)
- **Prioridad:** 🟢 P3 - Bajo
- **Labels:** `enhancement`, `p3-low`, `frontend`
- **Archivos:** `frontend/src/App.tsx`, `frontend/vite.config.ts`
- **Descripción:** El bundle principal pesa casi 1 MB (`index-*.js: 939.74 kB`), superando las recomendaciones de rendimiento para conexiones móviles en planta o celulares de clientes.
- **Criterios de Aceptación:**
  - [ ] Configurar división por rutas/vistas mediante `React.lazy` y `Suspense` (`DashboardView`, `MatrixEntryView`, `AuditoriaView`, `PortalHotelView`, `CatalogView`).
  - [ ] Configurar `manualChunks` en Rollup para aislar `recharts` y `lucide-react`.
  - [ ] Reducir el chunk inicial por debajo de 350 kB.

---

## 🟢 EPIC 6: Experiencia de Desarrollo & Refactorización Modular (P3)

### [DX-01] Corrección de `user.id = 0` en `AuthContext`
- **Prioridad:** 🟢 P3 - Bajo
- **Labels:** `bug`, `p3-low`, `frontend`, `backend`
- **Archivos:** `backend/internal/handlers/auth.go`, `frontend/src/contexts/AuthContext.tsx`
- **Descripción:** `POST /auth/login` no incluye el ID numérico del usuario en la respuesta. El frontend setea `id: 0`, causando incongruencias hasta que se recarga la página.
- **Criterios de Aceptación:**
  - [ ] Añadir `ID int` en `models.LoginResponse`.
  - [ ] Actualizar `AuthContext.tsx` para inicializar el estado del usuario con el ID real inmediatamente tras el login.

---

### [DX-02] Modularización de Componentes Monolíticos (> 1500 líneas)
- **Prioridad:** 🟢 P3 - Bajo
- **Labels:** `enhancement`, `p3-low`, `frontend`
- **Archivos:** `frontend/src/components/matrix/MatrixEntryView.tsx`, `frontend/src/components/portal/AuditoriaView.tsx`
- **Descripción:** `AuditoriaView.tsx` (1743 líneas) y `MatrixEntryView.tsx` (1631 líneas) contienen lógica de red, tablas, modals de impresión, hooks de timer y estilos entrelazados en un único archivo.
- **Criterios de Aceptación:**
  - [ ] Extraer subcomponentes: celdas de matriz, filtros de sector, modales de conteo y tarjeta de resumen.
  - [ ] Extraer custom hooks para el auto-guardado con debounce y cancelación de abort controllers.
