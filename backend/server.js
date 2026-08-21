import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { DuckDBInstance } from "@duckdb/node-api";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DUCKDB_PATH;

if (!DB_PATH) {
  console.error("Falta DUCKDB_PATH en .env");
  process.exit(1);
}

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
}));
app.use(express.json());

const instance = await DuckDBInstance.create(DB_PATH, {
  access_mode: "READ_ONLY",
});
const connection = await instance.connect();

async function rows(sql, params = []) {
  const result = await connection.run(sql, params);
  return await result.getRowObjectsJson();
}

function safeDateExpr(column) {
  return `CASE
    WHEN ${column} IS NOT NULL
     AND EXTRACT(YEAR FROM ${column}) BETWEEN 1900 AND 2100
    THEN ${column}
    ELSE NULL
  END`;
}

function ownerName(alias = "pe") {
  return `TRIM(CONCAT_WS(' ',
      NULLIF(${alias}.PERS_NOMBRE, ''),
      NULLIF(${alias}.PERS_PATERNO, ''),
      NULLIF(${alias}.PERS_MATERNO, '')
    ))`;
}

app.get("/api/health", async (_req, res) => {
  try {
    const [{ tablas }] = await rows(`
      SELECT COUNT(*)::INTEGER AS tablas
      FROM duckdb_tables()
      WHERE internal = false
    `);
    res.json({ ok: true, database: DB_PATH, tablas });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ------------------------------------------------------------
// BÚSQUEDA POR SOLICITUD
// ------------------------------------------------------------
app.get("/api/solicitudes/:termino", async (req, res) => {
  const termino = req.params.termino.trim();

  try {
    const solicitudes = await rows(`
      SELECT
        s.SOLI_NUMERO,
        s.SOLI_NUMERO_DISP,
        ${safeDateExpr("s.SOLI_FECHA_INGRESO")} AS FECHA_INGRESO,
        EXTRACT(YEAR FROM ${safeDateExpr("s.SOLI_FECHA_INGRESO")})::INTEGER AS ANO_SOLICITUD,
        ${safeDateExpr("s.SOLI_FECHA_RESOLUCION")} AS FECHA_RESOLUCION,
        s.SOLI_NRO_RESOLUCION,
        s.SOLI_SUP_SOLICITADA,
        s.SOLI_SUP_APROBADA,
        s.SOLI_SUP_VIGENTE,
        ts.TISO_DESCRIPCION AS TIPO_SOLICITUD,
        e.ESTA_DESCRIPCION AS ESTADO
      FROM SOLICITUD s
      LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO = s.TISO_CODIGO
      LEFT JOIN ESTADO e ON e.ESTA_CODIGO = s.ESTA_CODIGO
      WHERE CAST(s.SOLI_NUMERO AS VARCHAR) = ?
         OR UPPER(COALESCE(s.SOLI_NUMERO_DISP, '')) = UPPER(?)
      LIMIT 20
    `, [termino, termino]);

    if (!solicitudes.length) {
      return res.status(404).json({ ok: false, message: "Solicitud no encontrada" });
    }

    const results = [];

    for (const solicitud of solicitudes) {
      const numero = Number(solicitud.SOLI_NUMERO);

      const predios = await rows(`
        SELECT DISTINCT
          p.PRED_CODIGO,
          p.PRED_NOMBRE,
          p.PRED_SUPERFICIE,
          p.PRED_UBICACION,
          p.PRED_REGISTRO,
          p.PRED_REGISTRO_BN,
          l.LOCA_CODIGO,
          l.LOCA_DESCRIPCION AS LOCALIDAD,
          l.LOCA_TIPO AS TIPO_LOCALIDAD,
          r.ROLES
        FROM PREDIOSOLICITUD ps
        INNER JOIN PREDIO p ON p.PRED_CODIGO = ps.PRED_CODIGO
        LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO = p.LOCA_CODIGO
        LEFT JOIN (
          SELECT
            PRED_CODIGO,
            STRING_AGG(DISTINCT ROL_NUMERO, ', ') AS ROLES
          FROM ROL
          GROUP BY PRED_CODIGO
        ) r ON r.PRED_CODIGO = p.PRED_CODIGO
        WHERE ps.SOLI_NUMERO = ?
        ORDER BY p.PRED_NOMBRE
      `, [numero]);

      const propietarios = await rows(`
        SELECT DISTINCT
          pe.PERS_CODIGO,
          pe.PERS_RUT,
          pe.PERS_DV,
          ${ownerName("pe")} AS NOMBRE_COMPLETO,
          pe.PERS_EMAIL,
          pe.PERS_TELEFONO
        FROM PROPIETARIO pr
        INNER JOIN PERSONA pe ON pe.PERS_CODIGO = pr.PERS_CODIGO
        WHERE pr.SOLI_NUMERO = ?
        ORDER BY NOMBRE_COMPLETO
      `, [numero]);

      results.push({ solicitud, predios, propietarios });
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ------------------------------------------------------------
// BÚSQUEDA POR PREDIO
// ------------------------------------------------------------
app.get("/api/predios", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ ok: false, message: "Falta q" });

  try {
    const predios = await rows(`
      SELECT DISTINCT
        p.PRED_CODIGO,
        p.PRED_NOMBRE,
        p.PRED_SUPERFICIE,
        p.PRED_UBICACION,
        p.PRED_REGISTRO,
        p.PRED_REGISTRO_BN,
        l.LOCA_CODIGO,
        l.LOCA_DESCRIPCION AS LOCALIDAD,
        l.LOCA_TIPO AS TIPO_LOCALIDAD,
        r.ROLES
      FROM PREDIO p
      LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO = p.LOCA_CODIGO
      LEFT JOIN (
        SELECT
          PRED_CODIGO,
          STRING_AGG(DISTINCT ROL_NUMERO, ', ') AS ROLES
        FROM ROL
        GROUP BY PRED_CODIGO
      ) r ON r.PRED_CODIGO = p.PRED_CODIGO
      WHERE CAST(p.PRED_CODIGO AS VARCHAR) = ?
         OR UPPER(COALESCE(p.PRED_NOMBRE, '')) LIKE '%' || UPPER(?) || '%'
         OR EXISTS (
            SELECT 1
            FROM ROL rx
            WHERE rx.PRED_CODIGO = p.PRED_CODIGO
              AND UPPER(COALESCE(rx.ROL_NUMERO, '')) LIKE '%' || UPPER(?) || '%'
         )
      ORDER BY p.PRED_NOMBRE
      LIMIT 50
    `, [q, q, q]);

    const results = [];

    for (const predio of predios) {
      const codigo = Number(predio.PRED_CODIGO);

      const solicitudes = await rows(`
        SELECT DISTINCT
          s.SOLI_NUMERO,
          s.SOLI_NUMERO_DISP,
          ${safeDateExpr("s.SOLI_FECHA_INGRESO")} AS FECHA_INGRESO,
          EXTRACT(YEAR FROM ${safeDateExpr("s.SOLI_FECHA_INGRESO")})::INTEGER AS ANO_SOLICITUD,
          ${safeDateExpr("s.SOLI_FECHA_RESOLUCION")} AS FECHA_RESOLUCION,
          s.SOLI_NRO_RESOLUCION,
          s.SOLI_SUP_SOLICITADA,
          s.SOLI_SUP_APROBADA,
          ts.TISO_DESCRIPCION AS TIPO_SOLICITUD,
          e.ESTA_DESCRIPCION AS ESTADO,
          STRING_AGG(
            DISTINCT NULLIF(${ownerName("pe")}, ''),
            ' | '
          ) AS PROPIETARIOS
        FROM PREDIOSOLICITUD ps
        INNER JOIN SOLICITUD s ON s.SOLI_NUMERO = ps.SOLI_NUMERO
        LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO = s.TISO_CODIGO
        LEFT JOIN ESTADO e ON e.ESTA_CODIGO = s.ESTA_CODIGO
        LEFT JOIN PROPIETARIO pr ON pr.SOLI_NUMERO = s.SOLI_NUMERO
        LEFT JOIN PERSONA pe ON pe.PERS_CODIGO = pr.PERS_CODIGO
        WHERE ps.PRED_CODIGO = ?
        GROUP BY
          s.SOLI_NUMERO, s.SOLI_NUMERO_DISP, s.SOLI_FECHA_INGRESO,
          s.SOLI_FECHA_RESOLUCION, s.SOLI_NRO_RESOLUCION,
          s.SOLI_SUP_SOLICITADA, s.SOLI_SUP_APROBADA,
          ts.TISO_DESCRIPCION, e.ESTA_DESCRIPCION
        ORDER BY FECHA_INGRESO DESC NULLS LAST
      `, [codigo]);

      const propietariosPredio = await rows(`
        SELECT DISTINCT
          pe.PERS_CODIGO,
          pe.PERS_RUT,
          pe.PERS_DV,
          ${ownerName("pe")} AS NOMBRE_COMPLETO
        FROM PROPIETARIOPREDIO pp
        INNER JOIN PERSONA pe ON pe.PERS_CODIGO = pp.PERS_CODIGO
        WHERE pp.PRED_CODIGO = ?
        ORDER BY NOMBRE_COMPLETO
      `, [codigo]);

      results.push({ predio, propietariosPredio, solicitudes });
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ------------------------------------------------------------
// BÚSQUEDA POR PROPIETARIO
// ------------------------------------------------------------
app.get("/api/propietarios", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ ok: false, message: "Falta q" });

  try {
    const propietarios = await rows(`
      SELECT
        pe.PERS_CODIGO,
        pe.PERS_RUT,
        pe.PERS_DV,
        ${ownerName("pe")} AS NOMBRE_COMPLETO,
        pe.PERS_EMAIL,
        pe.PERS_TELEFONO
      FROM PERSONA pe
      WHERE CAST(pe.PERS_RUT AS VARCHAR) = REPLACE(REPLACE(?, '.', ''), '-', '')
         OR UPPER(${ownerName("pe")}) LIKE '%' || UPPER(?) || '%'
      ORDER BY NOMBRE_COMPLETO
      LIMIT 50
    `, [q, q]);

    const results = [];

    for (const propietario of propietarios) {
      const persCodigo = Number(propietario.PERS_CODIGO);

      const predios = await rows(`
        SELECT DISTINCT
          p.PRED_CODIGO,
          p.PRED_NOMBRE,
          p.PRED_SUPERFICIE,
          p.PRED_UBICACION,
          l.LOCA_DESCRIPCION AS LOCALIDAD,
          r.ROLES
        FROM PROPIETARIOPREDIO pp
        INNER JOIN PREDIO p ON p.PRED_CODIGO = pp.PRED_CODIGO
        LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO = p.LOCA_CODIGO
        LEFT JOIN (
          SELECT PRED_CODIGO, STRING_AGG(DISTINCT ROL_NUMERO, ', ') AS ROLES
          FROM ROL
          GROUP BY PRED_CODIGO
        ) r ON r.PRED_CODIGO = p.PRED_CODIGO
        WHERE pp.PERS_CODIGO = ?
        ORDER BY p.PRED_NOMBRE
      `, [persCodigo]);

      const solicitudes = await rows(`
        SELECT DISTINCT
          s.SOLI_NUMERO,
          s.SOLI_NUMERO_DISP,
          ${safeDateExpr("s.SOLI_FECHA_INGRESO")} AS FECHA_INGRESO,
          EXTRACT(YEAR FROM ${safeDateExpr("s.SOLI_FECHA_INGRESO")})::INTEGER AS ANO_SOLICITUD,
          ts.TISO_DESCRIPCION AS TIPO_SOLICITUD,
          e.ESTA_DESCRIPCION AS ESTADO,
          p.PRED_CODIGO,
          p.PRED_NOMBRE,
          p.PRED_SUPERFICIE,
          l.LOCA_DESCRIPCION AS LOCALIDAD
        FROM PROPIETARIO pr
        INNER JOIN SOLICITUD s ON s.SOLI_NUMERO = pr.SOLI_NUMERO
        LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO = s.TISO_CODIGO
        LEFT JOIN ESTADO e ON e.ESTA_CODIGO = s.ESTA_CODIGO
        LEFT JOIN PREDIOSOLICITUD ps ON ps.SOLI_NUMERO = s.SOLI_NUMERO
        LEFT JOIN PREDIO p ON p.PRED_CODIGO = ps.PRED_CODIGO
        LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO = p.LOCA_CODIGO
        WHERE pr.PERS_CODIGO = ?
        ORDER BY FECHA_INGRESO DESC NULLS LAST
      `, [persCodigo]);

      results.push({ propietario, predios, solicitudes });
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`SAFF API: http://localhost:${PORT}`);
  console.log(`DuckDB: ${DB_PATH}`);
});