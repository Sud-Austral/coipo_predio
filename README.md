# SAFF - Buscador Predial v0.1.0

Primera vista funcional para consultar información desde `mi_base.duckdb`.

## Arquitectura

- Frontend: React + Vite
- Backend local: Node.js + Express
- Base de datos: DuckDB en modo solo lectura
- Comunicación: REST JSON

## Modos de búsqueda

1. Solicitud
   - Busca por `SOLI_NUMERO` o `SOLI_NUMERO_DISP`
   - Devuelve año, tipo, estado, predio(s), superficie y propietario(s)

2. Predio
   - Busca por código, nombre o rol
   - Devuelve ficha del predio y todas las solicitudes asociadas

3. Propietario
   - Busca por RUT, nombre o apellido
   - Devuelve propietario, predios y solicitudes asociadas

## Puesta en marcha

### Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Edita `.env` para apuntar a tu archivo:

```env
DUCKDB_PATH=C:\Users\tu_usuario\ruta\mi_base.duckdb
PORT=3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre la URL indicada por Vite, normalmente `http://localhost:5173`.

## Importante

Las relaciones SQL de esta v0.1.0 se basan en la estructura detectada:

- `SOLICITUD.SOLI_NUMERO`
- `PREDIOSOLICITUD.SOLI_NUMERO`
- `PREDIOSOLICITUD.PRED_CODIGO`
- `PREDIO.PRED_CODIGO`
- `PROPIETARIO.SOLI_NUMERO`
- `PROPIETARIO.PERS_CODIGO`
- `PERSONA.PERS_CODIGO`
- `PREDIO.LOCA_CODIGO`
- `LOCALIDAD.LOCA_CODIGO`

Antes de cerrar el modelo definitivo conviene validar cardinalidades con datos reales.