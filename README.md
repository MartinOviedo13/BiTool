# Lavadero BI — Sistema de Business Intelligence, Portal B2B y Control Operativo

Sistema de Business Intelligence, Auditoría y Portal B2B desarrollado para la digitalización y optimización operativa de la lavandería industrial **Poseidón Servicio de Lavandería SRL**. 

El proyecto reemplaza el manejo físico de planillas de papel y remitos manuales por una plataforma integral que conecta la recepción de ropa de los hoteles clientes, el procesamiento en planta y el análisis gerencial de datos.

---

## 📌 Estado Actual del Proyecto

| Módulo / Funcionalidad | Estado | Detalle |
|---|---|---|
| **Arquitectura Base & DB** | ✅ **Completado** | PostgreSQL, migraciones con Goose, conexión optimizada con `pgxpool`. |
| **Autenticación & Roles** | ✅ **Completado** | Seguridad JWT con roles (`admin`, `operario`, `cliente`) y aislamiento de datos por hotel. |
| **Importador Masivo de Excel** | ✅ **Completado** | Des-pivote matricial automático vía `excelize`, validación fila por fila y UPSERT transaccional. |
| **Portal B2B Clientes (Mobile-First)** | ✅ **Completado** | Diseñado para mucamas/personal de lencería en celular: botones táctiles grandes, atajos rápidos (`+5`, `+10`, `+25`), barra fija de guardado y emisión de remitos. |
| **Trazabilidad QR & WhatsApp** | ✅ **Completado** | Generación de etiquetas con Códigos QR únicos (`ENV-...`) para escanear en bolsas y compartir remito por WhatsApp con el chofer. |
| **Auditoría & Cruce Automático** | ✅ **Completado** | Cruce en tiempo real: Declarado por Hotel vs. Procesado en Lavadero. Discriminación de **Limpias (OK)**, **En Relavado (en planta)** y **Rotas/Bajas**. |
| **Dashboard BI & Métricas** | ✅ **Completado** | KPIs interactivos con Recharts: prendas procesadas, facturables, tasas de relavado, roturas y gasto acumulado. |
| **Asistente IA (RAG & Tool Use)** | ⏳ **En Preparación** | Agente de consulta en lenguaje natural sobre métricas y tendencias de producción. |

---

## 🏗️ Arquitectura y Estructura del Repositorio

```text
lavadero-bi/
├── backend/                             ← API REST en Go + PostgreSQL
│   ├── cmd/api/                         ← Entrypoint (main.go, env.go)
│   ├── cmd/hashpwd/                     ← Utilidad para generación de hashes bcrypt
│   ├── internal/                        
│   │   ├── database/                    ← Configuración y conexión de pool (pgxpool)
│   │   ├── handlers/                    ← Controladores HTTP (auth, b2b, auditoria, imports, bi)
│   │   ├── models/                      ← Estructuras de datos Go (DTOs y entidades)
│   │   ├── routes/                      ← Configuración del router Chi y middlewares de roles
│   │   └── services/                    ← Servicios de importación Excel y lógica de negocio
│   ├── migrations/                      ← Migraciones SQL versionadas con Goose (001 a 008)
│   │   ├── 001_init.sql                 ← Tablas iniciales (hoteles, items, registros)
│   │   ├── 002_seed_catalogos.sql       ← Semilla de 44 hoteles y 14 tipos de prendas
│   │   ├── 003_usuarios.sql             ← Tabla de usuarios con roles y passwords bcrypt
│   │   ├── 004_imports.sql              ← Tablas para importaciones masivas y staging
│   │   ├── 005_import_errores.sql       ← Almacenamiento JSONB de reportes de error
│   │   ├── 006_portal_b2b.sql           ← Remitos digitales (`envios`, `envio_detalles`) y vínculos a hoteles
│   │   ├── 007_rol_cliente.sql          ← Soporte de rol 'cliente' y usuario demo
│   │   └── 008_relavado_roturas.sql     ← Columnas de seguimiento para relavado y prendas rotas
│   └── .env.example                     ← Plantilla de variables de entorno
├── frontend/                            ← Single Page Application en React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── api/                         ← Cliente HTTP tipado con resolución automática de host (LAN/Local)
│   │   ├── components/                  
│   │   │   ├── auth/                    ← Formulario de Login adaptativo
│   │   │   ├── layout/                  ← Navbar responsive con colapso móvil
│   │   │   ├── portal/                  ← Portal B2B para hoteles (`PortalHotelView`) y Auditoría (`AuditoriaView`)
│   │   │   ├── dashboard/               ← Panel analítico gerencial y alertas automáticas
│   │   │   ├── matrix/                  ← Grilla matricial de carga diaria e importación
│   │   │   └── catalog/                 ← Catálogos de prendas y hoteles
│   │   ├── contexts/                    ← AuthContext y gestión de sesión JWT
│   │   ├── types/                       ← Definición de interfaces TypeScript
│   │   └── utils/                       ← Formateadores de moneda, números y fechas
│   ├── package.json
│   ├── vite.config.ts                   ← Configurado con server.host = true para acceso LAN
│   └── tsconfig.json
├── README.md                            ← Documentación técnica y funcional
├── PLAN_MEJORAS.md                      ← Roadmap de mejoras operativas y de producto
└── BACKLOG.md                           ← Product & Security Backlog con tracking de issues
```

---

## 🚀 Cómo ejecutar el proyecto localmente

### Requisitos previos
* **Go** (v1.22 o superior)
* **Node.js** (v18 o superior) y **npm**
* **PostgreSQL** (v14 o superior) corriendo en el puerto `5432`

---

### 1. Backend (API en Go)

```powershell
cd backend

# 1. Configurar variables de entorno (ajustar credenciales de PostgreSQL si corresponde)
cp .env.example .env

# 2. Ejecutar las migraciones de base de datos
goose -dir ./migrations postgres "postgres://postgres:tu_password@localhost:5432/lavadero_bi?sslmode=disable" up

# 3. Compilar e iniciar el servidor
go run ./cmd/api
```
> La API quedará disponible en: `http://localhost:8000` (y escuchando en todas las interfaces de red para acceso móvil).

---

### 2. Frontend (React + Vite)

```powershell
cd frontend

# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor de desarrollo
npm run dev
```
> La aplicación estará disponible en: `http://localhost:5173`.

---

## 📱 Acceso desde Dispositivos Móviles (Celulares / Tablets)

El sistema está configurado para que cualquier dispositivo conectado a la misma red Wi-Fi pueda acceder al sistema:

1. Conectá el teléfono a la misma red Wi-Fi de la computadora.
2. Ingresá desde el navegador del celular a:
   `http://<TU_IP_LOCAL>:5173` (ejemplo: `http://192.168.0.152:5173`).
3. El frontend detecta automáticamente la IP de la máquina y redirige las llamadas API al backend en el puerto `8000`.

---

## 👥 Cuentas de Acceso para Pruebas (Semillas Locales de Desarrollo)

> **Nota de Seguridad:** Los usuarios y contraseñas listados a continuación corresponden **únicamente a semillas locales de prueba para el entorno de desarrollo** (`migrations/003_usuarios.sql` y `migrations/007_rol_cliente.sql`). Nunca deben utilizarse en entornos productivos.

| Rol | Usuario | Contraseña | Perfil y Acceso |
|---|---|---|---|
| **Administrador** | `admin` | `admin1234` | Acceso total: Dashboard BI, Auditoría, Carga Diaria, Importador Excel, Catálogos e IA. |
| **Operario Planta** | `operario` | `operario1234` | Operación diaria: Grilla de Carga y Auditoría con lector de QR de remitos. |
| **Cliente Hotel** | `kingdavid` | `hotel1234` | Portal B2B: Emisión de remitos con QR, métricas de prendas en tránsito, relavados y roturas. |

---

## 🛠️ Stack Tecnológico

* **Backend:** Go 1.22+, Router Chi, Driver `pgx/v5` (`pgxpool`), JWT (`golang-jwt/v5`), Hashing `bcrypt`, Manipulación de planillas `excelize/v2`.
* **Base de Datos:** PostgreSQL 18+, Migraciones versionadas con `goose`.
* **Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS, Lucide Icons, Recharts.
* **Redes & Trazabilidad:** Código QR (`qrserver` / SVG), deep-linking para WhatsApp, diseño Mobile-First con touch targets de 44px+.

---

## 🎓 Proyecto
* **Autor:** Martín Oviedo
* **Carrera:** Analista de Sistemas
* **Organización:** IRESM &bull; Poseidón Servicio de Lavandería SRL
