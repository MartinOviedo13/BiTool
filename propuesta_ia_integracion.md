# Propuesta de Integración de IA — Lavadero BI

Documento de diseño de los módulos de Inteligencia Artificial a implementar en la **Fase 3** del sistema Lavadero BI (tesis de Analista de Sistemas — IRESM). Complementa el README principal del proyecto.

---

## 1. Objetivos

1. Permitir al usuario hacer preguntas sobre la operatoria en **lenguaje natural** y obtener respuestas a partir de los datos reales de PostgreSQL.
2. Predecir la **demanda de personal (staffing)** en función del volumen histórico de prendas procesadas.
3. Generar **diagnósticos ejecutivos automáticos** sin exponer datos crudos ni información personal.

---

## 2. Arquitectura propuesta

```text
Frontend React (Asistente IA)
        │  POST /api/ia/ask  { mensaje }
        ▼
Backend Go — servicio `services/ia.go`
        │
        ├── 1) Guardado del mensaje
        ├── 2) Conversión NL → SQL (LLM + Structured Outputs)
        │       · Config schema: solo vistas de solo-lectura
        │       · Base de datos usada como contexto (esquema y catálogo)
        ├── 3) Validación del SQL (whitelist: SELECT, sin DDL/DML)
        ├── 4) Ejecución del SQL en PostgreSQL
        └── 5) Respuesta en lenguaje natural (LLM) con el resultado
```

### Pipeline de consulta inteligente

| Paso | Responsable | Detalle |
|---|---|---|
| 1 | Backend | Recibe la pregunta del usuario y ejecuta el pipeline. |
| 2 | LLM (Structured Outputs) | Genera un `SELECT` seguro a partir del schema. |
| 3 | Backend / Validador | Verifica que el SQL sea de solo-lectura y no modifique datos. |
| 4 | pgxpool | Ejecuta la consulta sobre una réplica o con `SET TRANSACTION READ ONLY`. |
| 5 | LLM | Sintetiza una respuesta clara en español a partir de las filas resultantes. |
| 6 | Backend | Devuelve el texto final + datos estructurados al frontend. |

### Salida estructurada (schema JSON esperado)

```jsonc
{
  "sql": "SELECT ...",        // SQL hipotético generado (para auditoría)
  "respuesta": "string",       // Explicación en lenguaje natural
  "datos": [ { /* filas */ } ] // Filas para graficar en el frontend
}
```

---

## 3. Proveedores de IA

Se contemplan dos integraciones intercambiables vía interfaz común (`LLMProvider`):

- **OpenAI**: modelos `gpt-4o` / `gpt-4o-mini` con *JSON Schema Structured Outputs*.
- **Google Gemini**: modelos `gemini-1.5-pro` / `gemini-1.5-flash` con `response_mime_type: "application/json"` y `response_schema`.

La elección se realiza por configuración en `.env`:

```env
IA_PROVEEDOR=openai | gemini
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

---

## 4. Módulo de Staffing (predicción de demanda de personal)

- **Fuente de datos**: serie histórica de `registros` (volumen diario por hotel/item).
- **Objetivo**: estimar cantidad de prendas por día futuro y derivar horas-hombre y turnos necesarios.
- **Enfoque sugerido**:
  - Modelo estadístico de línea base: promedios móviles + estacionalidad semanal (simple, auditable para la tesis).
  - Opcional: modelo de regresión/ML ligero embebido en Go o servicio complementario Python.
- **Salida**: `GET /api/ia/staffing?dias=14` con la proyección por día, intervalo de confianza y personal estimado.

---

## 5. Medidas de seguridad

- El SQL generado **nunca** se ejecuta de forma directa: pasa por un validador que solo admite `SELECT`.
- Se recomienda ejecutar la consulta con una cuenta de base de datos de **solo-lectura**.
- Los datos enviados al LLM se limitan a **agregados** (sumas, conteos, top-N), nunca filas con datos personales.
- Cifrado e inyección de API keys solo vía variables de entorno (nunca en el repositorio).

---

## 6. Hitos de implementación

| Hito | Alcance | Estado |
|---|---|---|
| Hito 0 | Base de datos, migraciones, API CRUD | Completado |
| Hito 1 | Importación Excel/CSV y reconciliación | Completado |
| Hito 2 | Dashboard BI y carga matricial | Completado |
| Hito 3 | Chat RAG SQL (asistente en lenguaje natural) | Pendiente |
| Hito 4 | Predicción de demanda / Staffing | Pendiente |

---

## 7. Puntos de contacto en el código

- `backend/internal/services/` → carpeta reservada para la lógica de IA.
- `backend/internal/handlers/analisis.go` → base para sumar el endpoint de IA.
- `backend/internal/routes/routes.go` → registro de nuevas rutas `/ia/*`.
- `frontend/src/components/ai/AIInsightsView.tsx` → vista actual (hoy genera prompts manuales); se reemplazará por el chat real.
- `frontend/src/api/client.ts` → archivo donde sumar `api.askIA()` y `api.getStaffing()`.