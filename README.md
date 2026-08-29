# Lavadero BI — Sistema de Business Intelligence e IA

Sistema de Business Intelligence + IA desarrollado como proyecto de tesis de Analista de Sistemas. Permite digitalizar la operatoria diaria del lavadero industrial *Poseidón Servicio de Lavandería SRL* y proveer diagnósticos inteligentes y predicción de demanda mediante Inteligencia Artificial.

## Contexto del Proyecto
La operatoria actual del lavadero (clientes tipo hoteles y empresas) se registra físicamente en planillas cuadriculadas de papel: hoteles en las filas y tipos de prendas en las columnas. El sistema permite realizar la carga digital diaria respetando esta misma disposición matricial, y consolida la información para ofrecer análisis avanzados y lenguaje natural mediante IA, superando alternativas genéricas como Power BI en simplicidad y adaptabilidad para PyMEs.

---

## Estado del proyecto

| | |
|---|---|
| **Fase actual** | Fase 2 — Integración y Frontend |
| **Hito en curso** | Hito 1 · Importación desde Excel/CSV y Reconciliación |
| **Inicio del proyecto** | 27/08/2026 |
| **Estado de API** | Online (`http://localhost:8000`) |

---

## Estructura del repositorio

```text
lavadero-bi/
├── backend/                             ← API REST en Go
│   ├── cmd/api/                         ← Punto de entrada (main.go, env.go)
│   ├── internal/                        
│   │   ├── database/                    ← Conexión e inicialización del pool (pgxpool)
│   │   ├── handlers/                    ← Controladores HTTP (hoteles, items, registros, analisis)
│   │   ├── models/                      ← Estructuras de datos Go
│   │   ├── routes/                      ← Router chi
│   │   └── services/                    ← Lógica de negocio e IA
│   ├── migrations/                      ← Migraciones de DB (goose)
│   │   ├── 001_init.sql                 ← Esquema de base de datos relacional
│   │   └── 002_seed_catalogos.sql       ← Carga inicial de 44 hoteles y 14 prendas
│   └── .env                             ← Configuración de base de datos
├── frontend/                            ← Dashboard en React (Vite)
│   ├── src/
│   │   ├── api/                         ← Cliente de API tipado para Go
│   │   ├── components/                  ← Vistas y Layouts (Dashboard, Matrix, Catalog, AI)
│   │   ├── types/                       ← Tipos e interfaces de TypeScript
│   │   └── utils/                       ← Formateadores y utilidades de fecha
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── README.md                            ← Presentación general del proyecto
└── propuesta_ia_integracion.md          ← Documentación de diseño del módulo de IA
```

---

## Plan de desarrollo — 3 fases

| Fase | Hitos | Objetivo | Estado |
|---|---|---|---|
| **1 — Base & API** | Hito 0 | Base de datos PostgreSQL local, migraciones y endpoints REST básicos. | **Completado** |
| **2 — Integración & Front** | Hitos 1–2 | Dashboard BI con Recharts, Grilla de Carga Matricial e Importación/Reconciliación desde Excel. | **En Curso** |
| **3 — Inteligencia Artificial** | Hitos 3–4 | Asistente de IA (Chat RAG SQL) y predicción de demanda de personal (*Staffing*). | **Pendiente** |

---

## Cómo levantar el proyecto localmente

### Requisitos previos
* **Go** (v1.27+)
* **Node.js** (v24+) y **npm**
* **PostgreSQL** corriendo en el puerto 5432

### 1. Levantar el Backend
```powershell
# Ingresar a la carpeta de backend
cd backend

# Copiar configuración y ajustar credenciales (de ser necesario)
cp .env.example .env

# Correr migraciones SQL
C:\Users\marti\go\bin\goose.exe -dir .\migrations postgres "postgresql://postgres:Conan13343@localhost:5432/lavadero_bi?sslmode=disable" up

# Compilar e iniciar servidor API
go run -buildvcs=false .\cmd\api
```
La API estará disponible en [http://localhost:8000](http://localhost:8000).

### 2. Levantar el Frontend
```powershell
# Ingresar a la carpeta de frontend
cd frontend

# Instalar dependencias
npm install --legacy-peer-deps

# Levantar el servidor de desarrollo Vite
npm run dev
```
La aplicación web estará disponible en [http://localhost:5173](http://localhost:5173).

---

## Stack tecnológico

| Capa | Tecnología | Detalle |
|---|---|---|
| **Base de datos** | PostgreSQL | Almacenamiento relacional optimizado |
| **Backend / API** | Go + chi | Router ultraligero y alto rendimiento |
| **Conector DB** | pgxpool | Driver moderno con manejo de pool de conexiones |
| **Migraciones** | goose | Control de versiones de esquema en SQL puro |
| **Frontend** | React (v18+) | Single Page Application rápida e interactiva |
| **Tipado** | TypeScript | Tipado fuerte de datos en el cliente |
| **Estilos** | Tailwind CSS | Utility-first CSS para UI responsiva y moderna |
| **Gráficos** | Recharts | Visualización interactiva de KPIs y tendencias |
| **IA** | OpenAI / Gemini | Integración multimodal y Structured Outputs |

---

## Equipo
* **Oviedo Martín** — Desarrollo / Práctica Profesionalizante
* **Tesis de Analista de Sistemas** — IRESM

---

## Para agentes de IA

Antes de comenzar cualquier tarea:
1. Leer [propuesta_ia_integracion.md](file:///c:/Users/marti/OneDrive/Documentos/BI%20Tool/lavadero-bi/propuesta_ia_integracion.md) para comprender la arquitectura de los módulos de IA a implementar.
2. Asegurar que el backend local esté corriendo (`GET http://localhost:8000/health`) antes de testear la integración.
3. No introducir BOM (Byte Order Mark) al crear o modificar archivos de configuración en el frontend.
