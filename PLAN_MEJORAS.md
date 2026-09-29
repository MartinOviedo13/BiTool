# PLAN DE MEJORAS — Lavadero BI

Proyecto de tesis de Analista de Sistemas (IRESM) — Sistema de BI + IA para el lavadero industrial *Poseidón Servicio de Lavandería SRL*.

Este documento es el plan priorizado de mejoras. Se analizó el código completo (backend Go + frontend React) y la documentación, y se definió el diseño del módulo de IA.

**Decisiones de alcance tomadas en conjunto:**
- Chat de IA con arquitectura **KPIs pre-calculados + redacción de texto** (la IA nunca genera ni ejecuta SQL).
- **Sin autenticación / login** en esta fase de la tesis (se documenta como evolución futura).
- Modelo IA: **Gemini API (tier gratuito)**, proveedor desacoplado detrás de una interfaz `LLMProvider`.

---

## PARTE 1 — Problemas y deuda técnica (ordenados por gravedad)

### 🔴 Críticos / Seguridad

- **P1. La `GEMINI_API_KEY` parece un token OAuth de Google (`AQ.…`) y no una API Key de AI Studio (`AIza…`).** El endpoint público de Gemini espera una key `AIza…`. Muy probable la extracción por IA falla en producción. Acción: regenerar una key real en AI Studio. El `.env` ya está excluido de git (no hay filtración).
- **P2. CORS abierto a `*`.** Restringir a `http://localhost:5173` (origen real del frontend) vía configuración.
- **P3. Sin autenticación en las rutas de escritura.** Decorar como evolución futura (fuera de scope).

### 🟠 Validación de datos (errores silenciosos)

- **P4. Sin validación de Foreign Keys en `registros`.** Insertar con `hotel_id`/`item_id` inexistentes → 500 genérico en vez de 400 claro. Batch sin validación de existencia.
- **P5. `updateRegistro/updateHotel/updateItem` no distinguen "no existe" de violación de constraint** → mensajes erróneos.
- **P6. Sin validación de rango de fechas** (`fecha_desde > fecha_hasta`) ni límites de longitud de strings.
- **P7. `optionalIntQuery` devuelve `nil` silenciosamente ante `hotel_id` mal formado** en listado, en vez de 400.

### 🟡 Deuda de arquitectura

- **P8. Toda la lógica SQL vive en handlers** (717 líneas en `registros.go`) en vez de `services/` como indica el propio README del servicio.
- **P9. Fuzzy matching O(n²)** en importación (aceptable a esta escala).
- **P10. Sin tests** en backend ni frontend.
- **P11. SQL injection:** verificado — **no hay** queries crudas; todos los valores usan parámetros `$N`. ✅
- **P12. Frontend:** consume **datos reales** en todas las vistas (sin placeholders de datos falsos). ✅

---

## PARTE 2 — Funcionalidades BI faltantes (impacto para la tesis vs esfuerzo)

- **F1. Comparación de períodos** (mes actual vs anterior, año vs año) — ⭐⭐⭐ alto impacto / bajo esfuerzo.
- **F2. Exportar reportes (PDF/Excel)** — ⭐⭐⭐ alto impacto / medio esfuerzo.
- **F3. Filtros más flexibles** (hotel específico, tipo de prenda, botón "mes anterior") — ⭐⭐ / bajo.
- **F4. Alertas automáticas** (hotel que bajó consumo X%, día con facturación anormal, relavado > umbral) — ⭐⭐ / medio.
- **F5. Serie temporal / tendencia** (gráfico de evolución diaria/semanal) — ⭐⭐ / bajo.
- **F6. Dashboard secundario por cliente** — ⭐ / medio.
- **F7. Precios históricos** por fecha — nota de diseño, no prioridad.
- **F8. Autenticación:** fuera de scope (decisión).

---

## PARTE 3 — Diseño del Chat IA (Gemini, desacoplado, KPIs + texto)

### Arquitectura elegida: (a) KPIs pre-calculados + redacción de texto

```
Frontend (panel chat)
      │  POST /api/ia/ask  { mensaje, rango }
      ▼
Backend Go — services/ia.go (orquesta)
      │  1) Determina de qué KPI(s) necesita respuesta
      │  2) Calcula KPIs del rango (+ período anterior para comparar)
      │  3) Arma un "nivel de datos" (solo agregados) + instrucciones
      │  4) LLM (Gemini) → responde en texto en español
      ▼
Interfaz LLMProvider (servicio desacoplado)
      ├── GeminiProvider   ← implementa LLMProvider (refactor de services/gemini.go)
      └── (futuro) OpenAIProvider / ClaudeProvider (se cambia por config)
```

Interfaz Go:

```go
type LLMProvider interface {
    Complete(ctx context.Context, system string, userMessages []Message) (string, error)
}
```

### Pros y contras de (a) KPIs+texto vs (b) function calling (para el caso puntual)

| Criterio | (a) KPIs pre-calculados | (b) Function calling / SQL |
|---|---|---|
| Riesgo en defensa en vivo | Bajo (determinista sobre datos calculados; fallback si la IA falla) | Alto (la IA puede inventar consultas o fallar el JSON) |
| Seguridad | Sin superficie: la IA nunca toca la DB | Requiere whitelist SELECT, esquema, cuenta read-only, rate limits |
| Latencia / costo (tier gratuito) | 1 llamada LLM | 2-3 llamadas LLM |
| Flexibilidad | Limitada a KPIs diseñados (cubre ~95% de preguntas de un dueño) | Ilimitada pero arriesgada |
| Complejidad | Baja-media | Alta (subproyecto) |
| "Wow" para el tribunal | Moderado | Alto pero arriesgado |

**Conclusión:** se elige (a) como columna vertebral. El function calling queda documentado como evolución.

### Preguntas que debe responder bien
- "¿Qué hotel facturó menos este mes?" (ranking por facturación, no solo volumen)
- "¿Cómo venimos comparado con el mes pasado?" (comparación de períodos — reusa F1)
- "¿Cuál es la tasa de relavado y está alta?" (KPI relavado + umbral)
- "¿Cuánto facturamos en total?", "¿Cuál es el volumen total?", "¿Quién es nuestro top cliente?"

### Seguridad
- La IA **nunca ejecuta SQL**.
- A Gemini solo se envían **agregados** (sumas, conteos, top-N), nunca registros crudos ni datos personales.
- El contexto (rango de fechas, hotel) se arma con parámetros **validados en el backend**.
- Prompt de sistema restringe a "no inventar números; usar solo los datos provistos".
- Timeout en el cliente HTTP + manejo de errores del tier gratuito (cuota/503) con mensaje amigable.

### UI propuesta
- Panel de chat **lateral (drawer)** accesible desde cualquier pestaña + la vista "Asistente IA" pasa a ser el chat a pantalla completa.
- Burbujas de mensaje, selector de período en el header y "chips" con preguntas sugeridas.

---

## PARTE 4 — Orden de implementación por etapas

| Etapa | Qué | Por qué primero | Depende de |
|---|---|---|---|
| **E1** | Endpoints de refuerzo + validación (P4–P7) + comparación/tendencia/tendencia/filtros (F1, F3, F5) | Base de datos sólida; frontend e IA dependen de esto | — |
| **E2** | Dashboard: %Δ vs período anterior, filtros hotel/prenda, gráfico de tendencia (F1, F3, F5) | Impacto visual para el dueño | E1 |
| **E3** | Exportar PDF/Excel (F2) | Tangible para mostrar | E1 |
| **E4** | Alertas automáticas + banner en dashboard (F4) | Primera "inteligencia" visible | E1 |
| **E5** | Chat IA (Gemini, KPIs+texto, `LLMProvider`) + panel lateral (Fase 3 de la tesis) | El hit de la defensa | E1 |
| **E6** | Refactor a `services/`, logging, CORS restringido (P2, P7, P8) | Limpieza, mejor al final | — |
| **E7** | Tests (smoke + batch) y documentación final de defensa | Pulido | todo |

**Recomendación:** arrancar por E1+E2 (core BI, resultado visible rápido), luego E5 (IA) para la defensa, y E6/E7 de pulido.

---

## PARTE 5 — Evolución futura documentada (fuera de scope)
- Autenticación multiusuario con roles.
- Function calling / SQL controlado para preguntas ad-hoc.
- Precios históricos por fecha.
- Predicción de demanda (staffing) con ML — módulo pendiente en `propuesta_ia_integracion.md`.
- Deploy a la nube (azd).

---

## ESTADO DE IMPLEMENTACIÓN

**E1–E5 implementadas y validadas** (backend `go build`/`go vet` OK; frontend `tsc` + `npm run build` OK; endpoints probados end-to-end con `curl`):

- ✅ **E1** — Seguridad de datos: `registros.create/update/batch` validan FKs con mensajes claros (400) y distinguen "no existe" de violación de constraint (`respond.go`, `query.go`); filtro `item_id`; fecha mal formada/invertida → 400. Endpoints nuevos `/analisis/comparar` y `/analisis/tendencia`; ranking admite `orden=cantidad|facturacion` y `limit`. ✅ **P11** sin inyección (parámetros `$N`); ✅ **P12** frontend con datos reales.
- ✅ **E2** — Dashboard: badge `%Δ` vs período anterior en KPI, filtros hotel/prenda, gráfico de tendencia, ranking por volumen y tabla detalle (`DashboardView.tsx`).
- ✅ **E3** — `GET /analisis/exportar.csv` (resumen + ranking, BOM UTF-8) + botón **Exportar CSV** en el dashboard. Validado: 200, `Content-Disposition`, contenido correcto.
- ✅ **E4** — `GET /alertas` evalúa heurísticas (relavado > 5%, prendas sin precio, facturación en cero, dependencia del top cliente ≥ 50%, hoteles inactivos acotados a 5) + panel **Alertas Automáticas** en dashboard (`AlertasPanel.tsx`). Validado end-to-end.
- ✅ **E5** — Chat IA con `LLMProvider` desacoplado (`provider.go`) y `IAService.Ask` (KPIs calculados + redacción con Gemini). Endpoint `POST /ia/ask`; frontend `ChatWidget.tsx` (chat a pantalla completa en la vista AI + FAB/drawer lateral global). El flujo mantiene el punto **P1**: la key actual (`AQ.…`) está denegada por Gemini (403) → **se necesita una key real `AIza…` de AI Studio** para respuestas reales.

**Pendientes (fuera del objetivo actual):** P2 (CORS restringido) y P8 (refactor a `services/`) en E6, y tests/docs finales en E7.

*Documento generado en la revisión inicial. Etapas E1–E5 implementadas en iteraciones sucesivas, cada una verificable por separado.*
