# CLAUDE.md — coipo_predio (SAFF Búsqueda Predial)

Guía para agentes. Visión general en `README.md`; problema y solución en `insumos/00-PROBLEMA.md` y `insumos/01-SOLUCION.md`.

## Qué es
Buscador de predios sobre datos SAFF: ficha de predio, propietario, solicitudes asociadas, mapa (Leaflet) y calidad del dato.
Dos modos (VERIFICADO en README y `frontend/src/api.js`):
- **Demo estática** para GitHub Pages: lee `frontend/public/demo-data.json`, sin backend.
- **Local con API**: backend Express que consulta dos DuckDB (SAFF y SIGCRA) en sólo lectura.

## Estructura
- `backend/server.js` (Express + `@duckdb/node-api`), `backend/VALIDAR_RELACIONES.sql`, `backend/.env.example`.
- `frontend/` React 18 + Vite 6 + react-leaflet (`src/App.jsx`, `src/api.js`, `public/demo-data.json`).
- `tools/exportar_demo_pages.py` genera `demo-data.json` desde las dos DuckDB (`tools/requirements.txt`).
- `.github/workflows/deploy-pages.yml` (build de `frontend/` y publicación en Pages) y `readme.yml` (generador automático de README/insumos).
- `iniciar_backend.bat`, `iniciar_frontend.bat` para Windows.

## Comandos (existen en los `package.json`)
- Backend: `cd backend && npm install && npm run dev` (o `npm start`); puerto 3001 por defecto.
- Frontend: `cd frontend && npm install && npm run dev`; `npm run build`; `npm run preview`.
- Sin `VITE_API_URL` el frontend usa el modo demo de Pages.
- No hay pruebas ni lint configurados: no lo comprobé más allá de leer los `package.json`.

## Configuración (sólo nombres)
Backend: `SAFF_DB_PATH` (alias `DUCKDB_PATH`), `SIGCRA_DB_PATH`, `PORT`. Frontend: `VITE_API_URL`.

## Endpoints (en `backend/server.js`)
`/api/health`, `/api/ejemplos`, `/api/predios`, `/api/predios/:codigo/geometria`, `/api/propietarios`,
`/api/solicitudes/:termino`, `/api/calidad-datos` y `POST /api/calidad-datos/refrescar`.

## Convenciones
Español en textos y comentarios. No se inventan geometrías: los límites de rodal sólo se dibujan cuando exista una relación cartográfica validada.

## Trampas
- Las versiones difieren: backend `0.4.0`, frontend `0.5.0`.
- `demo-data.json` está versionado en un repositorio público y puede contener datos de personas o predios reales: `insumos/MANIFIESTO.yaml` lo marca como `[VERIFICAR]`. No agregar más datos reales sin revisar.
- `readme.yml` regenera el README en cada push a `main`: editar el README a mano puede ser sobrescrito.

## No tocar / no commitear
Archivos `.duckdb`, `.env`, y datos masivos de SAFF. `.github/workflows/readme.yml` apunta a un generador externo con versión fijada.
