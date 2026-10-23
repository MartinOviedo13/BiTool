# Propuesta de Integración de IA & Protocolo MCP — Lavadero BI

Documento de diseño y arquitectura de los módulos de Inteligencia Artificial implementados en el sistema Lavadero BI (tesis de Analista de Sistemas — IRESM). Complementa el README principal del proyecto.

---

## 1. Objetivos

1. Permitir al usuario hacer preguntas sobre la operatoria en **lenguaje natural** y obtener respuestas precisas a partir de herramientas estandarizadas bajo el **Model Context Protocol (MCP)**.
2. Predecir la **demanda de personal (staffing)** en función del volumen histórico de prendas procesadas y la estacionalidad semanal.
3. Generar **diagnósticos ejecutivos automáticos y auditoría de calidad** sin exponer datos crudos ni información personal.
4. Exponer las capacidades de consulta analítica tanto internamente para la aplicación web como externamente para clientes MCP (Claude Desktop, Antigravity, Cursor o agentes autónomos).

---

## 2. Arquitectura Implementada (Model Context Protocol)

```text
Frontend React (ChatWidget)
        │  POST /ia/ask  { mensaje, fecha_desde, fecha_hasta, historial }
        ▼
Backend Go — servicio `services/ia.go` (MCP Host)
        │
        ├── 1) Consulta inicial a Gemini API (`gemini-3.8-flash`) con catálogo de Tools MCP
        │
        ├── 2) Ciclo Agéntico (Tool Calling Loop — hasta 4 iteraciones):
        │       ├── Modelo solicita Tool Call (ej: get_ranking_hoteles, get_ficha_hotel_360)
        │       ├── Servidor MCP (`internal/mcp`) despacha la herramienta sobre PostgreSQL
        │       └── Resultado formateado se envía al modelo como functionResponse
        │
        └── 3) Síntesis final en lenguaje natural + lista de `tools_usadas` devuelta al frontend
```

### Canales de Exposición MCP

1. **In-Process MCP Host:** Integrado directamente en `IAService` para responder a la web con cero latencia de red.
2. **HTTP JSON-RPC 2.0:** Endpoint autenticado `POST /api/mcp` para clientes web y microservicios.
3. **CLI Stdio:** Ejecutable `backend/cmd/mcp/main.go` para conectar clientes de escritorio estándar (Claude Desktop, Cursor, Antigravity).

---

## 3. Catálogo de Herramientas MCP (9 Tools Activas)

| Nombre de la Tool | Categoría | Descripción |
|---|---|---|
| `get_resumen_bi` | Métricas BI | Totales de prendas, facturables, relavado, roturas y facturación estimada ARS con variación % vs período anterior. |
| `get_ranking_hoteles` | Analítica | Ranking por facturación, volumen, relavado o roturas en orden ASC o DESC (para detectar líderes o menor facturación). |
| `get_ficha_hotel_360` | CRM / Cliente | Ficha integral de un hotel: consumo por prenda, tasa de relavado vs benchmark general de planta y remitos. |
| `get_alertas_operativas` | Auditoría | Heurísticas automáticas: relavado > 5%, roturas > 2%, prendas sin precio, concentración ≥ 50% y clientes inactivos. |
| `get_conciliacion_y_entregas` | Logística / B2B | Estado de remitos con QR, diferencias entre hotel y lavadero, y confirmaciones de entrega en destino. |
| `get_catalogo_tarifario` | Maestro | Catálogo de prendas, precios unitarios, identificación de prendas sin tarifa y padrón de hoteles. |
| `get_tendencia_produccion` | Series Temporales | Evolución diaria de prendas y facturación para análisis de picos operativos. |
| `query_readonly_sql` | Text-to-SQL Seguro | Ejecución controlada de `SELECT` con `SET TRANSACTION READ ONLY`, timeout estricto de 3s y límite de filas. |
| `predict_staffing_demanda` | Proyección / IA | Proyección de demanda a 7-14 días, cálculo de horas-hombre y turnos de operarios requeridos en planta. |

---

## 4. Recursos MCP (MCP Resources)

- `lavadero://contexto/reglas-negocio`: Umbrales industriales (relavado óptimo ≤ 5%, roturas ≤ 2%, concentración saludable < 50%).
- `lavadero://catalogos/resumen`: Padrón compacto de hoteles activos y tipos de prendas para desambiguación semántica.

---

## 5. Proveedor de IA

- **Google Gemini API**: Modelo por defecto `gemini-3.8-flash` (1M tokens, baja latencia y optimización nativa para *Agentic Tool Use* / Function Calling).
- Configuración en `.env`:
  ```env
  GEMINI_API_KEY=tu_api_key_de_gemini
  GEMINI_MODEL=gemini-3.8-flash
  ```

---

## 6. Hitos de Implementación

| Hito | Alcance | Estado |
|---|---|---|
| Hito 0 | Base de datos, migraciones, API CRUD | ✅ Completado |
| Hito 1 | Importación Excel/CSV y reconciliación | ✅ Completado |
| Hito 2 | Dashboard BI y carga matricial | ✅ Completado |
| Hito 3 | Chat RAG + MCP Tools (asistente en lenguaje natural con trazabilidad) | ✅ Completado |
| Hito 4 | Predicción de demanda / Staffing (`predict_staffing_demanda`) | ✅ Completado |

---

## 7. Puntos de Contacto en el Código

- `backend/internal/mcp/` → Servidor JSON-RPC 2.0, registro de Tools y Resources (`server.go`, `protocol.go`, `tools_bi.go`, `resources.go`).
- `backend/cmd/mcp/main.go` → Binario CLI para transporte Stdio con clientes MCP externos.
- `backend/internal/services/gemini.go` → Cliente Gemini actualizado a `gemini-3.8-flash` con soporte para Function Declarations y Function Responses.
- `backend/internal/services/ia.go` → Orquestador agéntico con loop de Tool Calling multi-turno.
- `backend/internal/handlers/ia.go` → Endpoint `POST /ia/ask` con soporte de historial multi-turno y `POST /api/mcp`.
- `frontend/src/components/ai/ChatWidget.tsx` → Widget de chat interactivo con visualización de badges de Tools MCP ejecutadas.
- `frontend/src/api/client.ts` → Cliente HTTP con soporte tipado para historial y `tools_usadas`.
