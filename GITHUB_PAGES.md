# Publicación en GitHub Pages

El repositorio ya incluye `.github/workflows/deploy-pages.yml`.

La publicación automática se activa con push a `main` o `master`.

El frontend usa `frontend/public/demo-data.json` cuando no existe `VITE_API_URL`.

Regla del dataset público:
- incluir solo predios/candidatos con geometría renderizable;
- no publicar las DuckDB;
- no inventar polígonos de rodal;
- ampliar el JSON con `tools/exportar_demo_pages.py`.
