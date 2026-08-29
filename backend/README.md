# Lavadero BI Backend

Backend en Go para la API del proyecto Lavadero BI.

## Stack

- Go
- PostgreSQL
- `chi` para la API REST
- `pgxpool` para la conexion a PostgreSQL
- `goose` para migraciones SQL en `migrations/`

## Configuracion

Copiar `.env.example` como `.env` y ajustar la clave de PostgreSQL:

```env
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/lavadero_bi
SERVER_ADDR=:8000
```

## Base de datos

Crear la base:

```sql
CREATE DATABASE lavadero_bi;
```

Aplicar migraciones con goose:

```powershell
goose -dir .\migrations postgres "postgresql://postgres:tu_password@localhost:5432/lavadero_bi" up
```

Si `goose` no esta en PATH, usar el binario instalado por Go:

```powershell
C:\Users\marti\go\bin\goose.exe -dir .\migrations postgres "postgresql://postgres:tu_password@localhost:5432/lavadero_bi" up
```

## Ejecutar

```powershell
go mod tidy
go build -buildvcs=false ./...
go run -buildvcs=false .\cmd\api
```

Swagger no queda automatico como en FastAPI. Mas adelante se puede agregar una especificacion OpenAPI o generar docs con Swagger.
