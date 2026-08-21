# SAFF Búsqueda Predial v0.5.0

Versión preparada para **GitHub Pages + GitHub Actions**.

## Qué publica GitHub Pages

GitHub Pages no ejecuta DuckDB ni Node. Por eso esta versión usa un dataset estático:

`frontend/public/demo-data.json`

El dataset incluido contiene **solo casos geográficos que pueden renderizarse sin inventar coordenadas**.

Con el informe suministrado se pudo publicar de forma autocontenida:

- Predio `22088`
- `HIJUELA Nº 3 -FDO. CRUCERO-LAS MINAS`
- Localidad: `PURRANQUE`
- 60 registros de rodal, 52 vigentes
- 4 puntos SAFF explícitos en el informe
- capa de predio disponible
- capa de rodales preparada, pero **sin polígono de rodal**, porque todavía no existe una relación cartográfica validada

El informe indica además 20 candidatos con suficientes conteos de coordenadas, pero para 19 de ellos el TXT no trae los vértices completos; no se inventaron datos.

## GitHub Pages

El workflow ya viene incluido:

`.github/workflows/deploy-pages.yml`

1. Sube todo el contenido del ZIP a la raíz del repositorio.
2. Haz commit/push a `main` o `master`.
3. En GitHub entra a **Settings > Pages**.
4. En **Build and deployment > Source**, selecciona **GitHub Actions**.
5. Abre la pestaña **Actions** y espera `Deploy GitHub Pages`.

El workflow ejecuta:

```bash
cd frontend
npm ci
npm run build
```

y publica `frontend/dist`.

## Probar localmente la demo Pages

```bash
cd frontend
npm install
npm run dev
```

No configures `VITE_API_URL` si quieres probar exactamente el modo GitHub Pages.

## Usar las DuckDB localmente

Conserva el backend de la v0.4.0.

`backend/.env`:

```env
SAFF_DB_PATH=C:\ruta\mi_base.duckdb
SIGCRA_DB_PATH=C:\ruta\sigcra.duckdb
PORT=3001
```

Para que el frontend use la API local crea `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
```

Luego:

```bash
cd backend
npm install
npm run dev
```

y en otra consola:

```bash
cd frontend
npm install
npm run dev
```

## Generar un dataset Pages más completo

Se incluye:

`tools/exportar_demo_pages.py`

Este script consulta tus dos DuckDB y escribe automáticamente `frontend/public/demo-data.json`, restringido a predios que:

- estén asociados a solicitudes;
- tengan rodales SAFF;
- tengan al menos 3 puntos lat/lon válidos en SIGCRA.

Ejemplo:

```bash
pip install -r tools/requirements.txt
python tools/exportar_demo_pages.py "C:\ruta\mi_base.duckdb" "C:\ruta\sigcra.duckdb" --limit 10
```

Después haces commit del JSON generado y GitHub Actions vuelve a publicar la demo.

## Capas del mapa

Fondos:
- Mapa base
- Relieve
- Satélite

Overlays:
- Predio: polígono clickeable cuando existe geometría.
- Rodales: listado clickeable y arquitectura GeoJSON preparada.
- Los límites de rodal no se fabrican: se dibujarán solo cuando encontremos una relación geográfica validada.

## Seguridad de datos

No se incluyen:
- `mi_base.duckdb`
- `sigcra.duckdb`
- archivos `.env`
- datos masivos de SAFF

GitHub contiene solo código y el conjunto acotado de datos de demostración.
