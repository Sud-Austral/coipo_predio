import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { DuckDBInstance } from "@duckdb/node-api";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const SAFF_DB_PATH = process.env.SAFF_DB_PATH || process.env.DUCKDB_PATH;
const SIGCRA_DB_PATH = process.env.SIGCRA_DB_PATH;

if (!SAFF_DB_PATH || !SIGCRA_DB_PATH) {
  console.error("Faltan SAFF_DB_PATH y/o SIGCRA_DB_PATH en backend/.env");
  process.exit(1);
}

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json());

const saffInstance = await DuckDBInstance.create(SAFF_DB_PATH, { access_mode: "READ_ONLY" });
const sigcraInstance = await DuckDBInstance.create(SIGCRA_DB_PATH, { access_mode: "READ_ONLY" });
const saff = await saffInstance.connect();
const sigcra = await sigcraInstance.connect();

async function q(conn, sql, params = []) {
  const result = await conn.run(sql, params);
  return await result.getRowObjectsJson();
}

function safeDateExpr(column) {
  return `CASE WHEN ${column} IS NOT NULL AND EXTRACT(YEAR FROM ${column}) BETWEEN 1900 AND 2100 THEN ${column} ELSE NULL END`;
}

function ownerName(alias = "pe") {
  return `TRIM(CONCAT_WS(' ', NULLIF(${alias}.PERS_NOMBRE,''), NULLIF(${alias}.PERS_PATERNO,''), NULLIF(${alias}.PERS_MATERNO,'')))`;
}

function uniqueGeoPoints(rows) {
  const pts = [];
  const seen = new Set();

  for (const r of rows) {
    const lat = Number(r.latitud);
    const lon = Number(r.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const key = `${lat.toFixed(9)},${lon.toFixed(9)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Para ordenar usamos Este/Norte cuando SIGCRA los trae. En áreas pequeñas
    // son mucho mejores que medir directamente sobre grados lat/lon.
    const este = Number(r.este);
    const norte = Number(r.norte);
    const cosLat = Math.cos(lat * Math.PI / 180);

    pts.push({
      lon,
      lat,
      x: Number.isFinite(este) ? este : lon * 111320 * cosLat,
      y: Number.isFinite(norte) ? norte : lat * 110540,
      ref: r.coor_punto_referencia,
    });
  }

  return pts;
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properSegmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const eps = 1e-9;

  // Para esta tarea solo nos interesan cruces reales. Contactos en los extremos
  // del segmento son válidos en un polígono.
  return ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
         ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps));
}

function segmentWouldCross(path, candidate) {
  if (path.length < 3) return false;
  const a = path[path.length - 1];
  const b = candidate;

  // No comparar contra el último segmento porque comparte el punto a.
  for (let i = 0; i < path.length - 2; i++) {
    const c = path[i];
    const d = path[i + 1];
    if (properSegmentsIntersect(a, b, c, d)) return true;
  }
  return false;
}

function nearestNeighborPath(points) {
  if (points.length <= 2) return [...points];

  // Punto inicial estable: extremo occidental; empate por sur.
  let startIndex = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[startIndex].x ||
       (points[i].x === points[startIndex].x && points[i].y < points[startIndex].y)) {
      startIndex = i;
    }
  }

  const remaining = [...points];
  const path = [remaining.splice(startIndex, 1)[0]];

  while (remaining.length) {
    const current = path[path.length - 1];
    const candidates = remaining
      .map((p, i) => ({ p, i, d: dist2(current, p) }))
      .sort((a, b) => a.d - b.d);

    // Preferimos el punto más cercano que no cree un cruce inmediato.
    let choice = candidates.find(c => !segmentWouldCross(path, c.p));
    if (!choice) choice = candidates[0];

    path.push(remaining.splice(choice.i, 1)[0]);
  }

  return path;
}

function routeLength(path) {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    total += Math.sqrt(dist2(path[i], path[(i + 1) % path.length]));
  }
  return total;
}

function twoOptUncross(path) {
  const p = [...path];
  const n = p.length;
  if (n < 4) return p;

  // 2-opt: elimina cruces e intercambia tramos cuando acorta el recorrido.
  let changed = true;
  let passes = 0;
  const maxPasses = Math.max(20, n * n);

  while (changed && passes < maxPasses) {
    changed = false;
    passes++;

    outer:
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      for (let j = i + 2; j < n; j++) {
        const j2 = (j + 1) % n;

        // Segmentos adyacentes o el primer/último segmento comparten extremo.
        if (i === j2 || i2 === j) continue;
        if (i === 0 && j2 === 0) continue;

        const a = p[i], b = p[i2], c = p[j], d = p[j2];
        const before = Math.sqrt(dist2(a, b)) + Math.sqrt(dist2(c, d));
        const after = Math.sqrt(dist2(a, c)) + Math.sqrt(dist2(b, d));
        const crosses = properSegmentsIntersect(a, b, c, d);

        if (crosses || after + 1e-7 < before) {
          const from = i2;
          const to = j;
          const reversed = p.slice(from, to + 1).reverse();
          p.splice(from, reversed.length, ...reversed);
          changed = true;
          break outer;
        }
      }
    }
  }

  return p;
}

function countCrossings(path) {
  const n = path.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 1; j < n; j++) {
      const j2 = (j + 1) % n;
      if (i === j || i2 === j || j2 === i) continue;
      if (i === 0 && j2 === 0) continue;
      if (properSegmentsIntersect(path[i], path[i2], path[j], path[j2])) count++;
    }
  }
  return count;
}

function buildNearestRing(rows) {
  const points = uniqueGeoPoints(rows);
  if (points.length < 3) return { ring: [], method: "insufficient_points", crossings: 0 };

  const initial = nearestNeighborPath(points);
  const ordered = twoOptUncross(initial);
  const ring = ordered.map(p => [p.lon, p.lat]);
  ring.push([...ring[0]]);

  return {
    ring,
    method: "nearest_neighbor_2opt",
    crossings: countCrossings(ordered),
    routeLengthMeters: routeLength(ordered),
  };
}

async function getGeo(predCodigo) {
  const code = String(predCodigo);
  const rows = await q(sigcra, `
    SELECT pred_codigo, coor_orden, coor_punto_referencia, longitud, latitud, este, norte,
           srid, sridoriginal, coor_datum, tipo_referencia,
           errorfomato, datuminvaildo, comunaycoordenadanocoincide,
           comunamascercana, loca_descripcion
    FROM conaf_coordenada_data_distancia
    WHERE TRIM(pred_codigo) = ?
      AND longitud IS NOT NULL AND latitud IS NOT NULL
    ORDER BY TRY_CAST(coor_orden AS DOUBLE), TRY_CAST(coor_punto_referencia AS DOUBLE)
  `, [code]);

  if (!rows.length) return { available: false, source: "SIGCRA", features: [] };

  const valid = rows.filter(r => !r.errorfomato && !r.datuminvaildo);
  const byOrder = new Map();
  for (const r of valid) {
    const key = String(r.coor_orden ?? "1");
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(r);
  }

  const groups = [...byOrder.entries()]
    .map(([key, rs]) => ({ key, ...buildNearestRing(rs) }))
    .filter(g => g.ring.length >= 4);

  // Los puntos de SIGCRA no siempre vienen en el orden del borde. Por eso cada
  // anillo se construye por proximidad y se corrige con 2-opt antes de cerrarlo.
  let features = [];
  if (groups.length > 1) {
    features = groups.map((g, i) => ({
      type: "Feature",
      properties: {
        role: "subdivision",
        label: `Subdivisión geométrica ${i + 1}`,
        coor_orden: g.key,
        orderingMethod: g.method,
        crossings: g.crossings,
        routeLengthMeters: g.routeLengthMeters,
      },
      geometry: { type: "Polygon", coordinates: [g.ring] }
    }));
  } else {
    const built = buildNearestRing(valid);
    if (built.ring.length >= 4) {
      features = [{
        type: "Feature",
        properties: {
          role: "predio",
          label: "Perímetro del predio",
          orderingMethod: built.method,
          crossings: built.crossings,
          routeLengthMeters: built.routeLengthMeters,
        },
        geometry: { type: "Polygon", coordinates: [built.ring] }
      }];
    }
  }

  const lats = valid.map(r => Number(r.latitud)).filter(Number.isFinite);
  const lons = valid.map(r => Number(r.longitud)).filter(Number.isFinite);
  const center = lats.length ? [lats.reduce((a,b)=>a+b,0)/lats.length, lons.reduce((a,b)=>a+b,0)/lons.length] : null;

  return {
    available: features.length > 0,
    source: "SIGCRA",
    pointCount: valid.length,
    srids: [...new Set(valid.map(r => r.srid).filter(v => v != null))],
    datum: [...new Set(valid.map(r => r.coor_datum).filter(v => v != null))],
    center,
    subdivisionCount: features.filter(f => f.properties.role === "subdivision").length,
    features,
    quality: {
      formatErrors: rows.filter(r => !!r.errorfomato).length,
      invalidDatum: rows.filter(r => !!r.datuminvaildo).length,
      communeMismatch: rows.filter(r => !!r.comunaycoordenadanocoincide).length,
    }
  };
}

async function getSubdivisionInfo(predCodigo) {
  const [sectores, rodales, areas] = await Promise.all([
    q(saff, `SELECT SECT_CODIGO, SECT_NUMERO, SECT_SUPERFICIE, SECT_VIGENTE FROM SECTOR WHERE PRED_CODIGO=? ORDER BY SECT_NUMERO`, [Number(predCodigo)]),
    q(saff, `SELECT RODA_CODIGO, RODA_NUMERO, RODA_SUPERFICIE, RODA_ANO_PLANTACION, RODA_VIGENTE FROM RODAL WHERE PRED_CODIGO=? ORDER BY RODA_NUMERO`, [Number(predCodigo)]),
    q(saff, `SELECT AREA_CODIGO, AREA_NUMERO, AREA_SUPERFICIE, AREA_VIGENTE FROM AREA WHERE PRED_CODIGO=? ORDER BY AREA_NUMERO`, [Number(predCodigo)])
  ]);
  return { sectores, rodales, areas };
}

async function enrichPredio(predio) {
  const codigo = Number(predio.PRED_CODIGO);
  const [geo, subdivisiones] = await Promise.all([getGeo(codigo), getSubdivisionInfo(codigo)]);
  // La estructura queda lista para incorporar geometría real de rodales.
  // Diagnóstico 2026-08-21: SAFF y SIGCRA no exponen aún una relación validada
  // RODA_CODIGO -> coordenadas, por lo que no fabricamos límites.
  const rodalGeo = {
    available: false,
    source: null,
    reason: "Sin relación geográfica de rodal validada",
    features: []
  };
  return { ...predio, geo, subdivisiones, rodalGeo };
}


function expedienteCategory(tableName) {
  const n = String(tableName || "").toUpperCase();
  if (n.includes("FICHA")) return "FICHA";
  if (n.includes("RESOL")) return "RESOLUCIONES";
  if (n.includes("INFORME") || n.startsWith("INFO")) return "INFORMES";
  if (n.includes("ACTIV") || n.includes("RESULTADO")) return "ACTIVIDADES";
  if (n.includes("OBSERV") || n.includes("BITACORA")) return "OBSERVACIONES";
  if (["DOCUMENT", "DOCU", "ANEXO", "ARCHIVO", "ADJUN", "OFICIO", "ACTA", "CERTIF", "PLANO", "DIGITAL", "RECURSO"].some(x => n.includes(x))) return "DOCUMENTOS_ANEXOS";
  return "OTRAS_RELACIONES";
}

let solicitudRelationTablesCache = null;
async function getSolicitudRelationTables() {
  if (Array.isArray(solicitudRelationTablesCache)) return solicitudRelationTablesCache;
  const rows = await q(saff, `
    SELECT DISTINCT table_name AS tabla
    FROM duckdb_columns()
    WHERE internal=false AND UPPER(column_name)='SOLI_NUMERO'
    ORDER BY table_name
  `);
  // Guardamos SIEMPRE strings en caché. En v0.3.0 se cacheaban objetos
  // y en una segunda búsqueda table.toUpperCase() fallaba.
  solicitudRelationTablesCache = rows
    .map(r => String(r?.tabla ?? "").trim())
    .filter(Boolean);
  return solicitudRelationTablesCache;
}

async function getSolicitudExpediente(soliNumero) {
  const tables = await getSolicitudRelationTables();
  const skip = new Set(["SOLICITUD", "PREDIOSOLICITUD", "PROPIETARIO"]);
  const groups = {
    FICHA: [], RESOLUCIONES: [], INFORMES: [], ACTIVIDADES: [],
    OBSERVACIONES: [], DOCUMENTOS_ANEXOS: [], OTRAS_RELACIONES: []
  };

  for (const table of tables) {
    if (skip.has(table.toUpperCase())) continue;
    // Los nombres vienen de metadatos de DuckDB, no del usuario.
    const safeTable = '"' + table.replaceAll('"', '""') + '"';
    try {
      const [countRow] = await q(saff, `SELECT COUNT(*)::INTEGER AS cantidad FROM ${safeTable} WHERE SOLI_NUMERO=?`, [soliNumero]);
      const cantidad = Number(countRow?.cantidad || 0);
      if (!cantidad) continue;
      groups[expedienteCategory(table)].push({ tabla: table, cantidad });
    } catch (_) {
      // Algunas vistas/tablas históricas pueden tener tipos incompatibles; no bloquean la ficha.
    }
  }

  // FICHA es especialmente relevante: damos una muestra liviana de identificadores/campos cortos.
  let fichaMuestra = [];
  try {
    const fichaRows = await q(saff, `SELECT * FROM FICHA WHERE SOLI_NUMERO=? LIMIT 5`, [soliNumero]);
    fichaMuestra = fichaRows.map(row => {
      const compact = {};
      for (const [k,v] of Object.entries(row)) {
        if (v === null || v === undefined || v === "") continue;
        const text = typeof v === "string" ? v : String(v);
        if (text.length <= 160 || /(^FIC_|FECHA|ESTADO|NUMERO|DIGITAL|OBS)/i.test(k)) compact[k] = text.length > 260 ? text.slice(0,260)+"…" : v;
        if (Object.keys(compact).length >= 12) break;
      }
      return compact;
    });
  } catch (_) {}

  const total = Object.values(groups).flat().reduce((a,b)=>a+b.cantidad,0);
  return { totalRegistrosRelacionados: total, grupos: groups, fichaMuestra };
}


let qualityCoverageCache = null;

async function computeQualityCoverage() {
  if (qualityCoverageCache) return qualityCoverageCache;

  const [universePredRows, saffCoordRows, sigcraCoordRows, relationRows] = await Promise.all([
    q(saff, `SELECT DISTINCT CAST(PRED_CODIGO AS VARCHAR) AS pred_codigo FROM PREDIOSOLICITUD WHERE PRED_CODIGO IS NOT NULL`),
    q(saff, `
      SELECT DISTINCT CAST(PRED_CODIGO AS VARCHAR) AS pred_codigo
      FROM COORDENADA
      WHERE PRED_CODIGO IS NOT NULL
        AND TRY_CAST(COOR_ESTE AS DOUBLE) IS NOT NULL
        AND TRY_CAST(COOR_NORTE AS DOUBLE) IS NOT NULL
    `),
    q(sigcra, `
      SELECT DISTINCT TRIM(pred_codigo) AS pred_codigo
      FROM conaf_coordenada_data_distancia
      WHERE pred_codigo IS NOT NULL AND TRIM(pred_codigo)<>''
        AND ((TRY_CAST(este AS DOUBLE) IS NOT NULL AND TRY_CAST(norte AS DOUBLE) IS NOT NULL)
          OR (TRY_CAST(longitud AS DOUBLE) IS NOT NULL AND TRY_CAST(latitud AS DOUBLE) IS NOT NULL))
    `),
    q(saff, `SELECT DISTINCT SOLI_NUMERO, CAST(PRED_CODIGO AS VARCHAR) AS pred_codigo FROM PREDIOSOLICITUD WHERE SOLI_NUMERO IS NOT NULL AND PRED_CODIGO IS NOT NULL`)
  ]);

  const normalize = rows => new Set(rows.map(r => String(r.pred_codigo ?? "").trim()).filter(Boolean));
  const universe = normalize(universePredRows);
  const saffCoords = normalize(saffCoordRows);
  const sigcraCoords = normalize(sigcraCoordRows);

  let ambas=0, soloSaff=0, soloSigcra=0, ninguna=0;
  for (const codigo of universe) {
    const a=saffCoords.has(codigo), b=sigcraCoords.has(codigo);
    if(a&&b) ambas++; else if(a) soloSaff++; else if(b) soloSigcra++; else ninguna++;
  }

  const solicitudState = new Map();
  for (const r of relationRows) {
    const sid=String(r.SOLI_NUMERO);
    const code=String(r.pred_codigo ?? "").trim();
    const geo=saffCoords.has(code)||sigcraCoords.has(code);
    const st=solicitudState.get(sid)||{any:false,all:true,count:0};
    st.any = st.any || geo;
    st.all = st.all && geo;
    st.count++;
    solicitudState.set(sid,st);
  }
  const totalSolicitudes=solicitudState.size;
  let solicitudesAlguna=0, solicitudesTodas=0;
  for(const st of solicitudState.values()){ if(st.any) solicitudesAlguna++; if(st.all) solicitudesTodas++; }

  const total=universe.size;
  const pct=(n,d=total)=>d?Number((n/d*100).toFixed(2)):0;
  const conAlguna=ambas+soloSaff+soloSigcra;

  qualityCoverageCache={
    generatedAt:new Date().toISOString(),
    universe:"PREDIOSOLICITUD",
    totalPredios:total,
    totalSolicitudes,
    categorias:{
      ambas:{cantidad:ambas,porcentaje:pct(ambas)},
      soloMiBase:{cantidad:soloSaff,porcentaje:pct(soloSaff)},
      soloSigcra:{cantidad:soloSigcra,porcentaje:pct(soloSigcra)},
      ninguna:{cantidad:ninguna,porcentaje:pct(ninguna)}
    },
    fuentes:{
      miBase:{cantidad:[...universe].filter(x=>saffCoords.has(x)).length, porcentaje:pct([...universe].filter(x=>saffCoords.has(x)).length)},
      sigcra:{cantidad:[...universe].filter(x=>sigcraCoords.has(x)).length, porcentaje:pct([...universe].filter(x=>sigcraCoords.has(x)).length)},
      algunaFuente:{cantidad:conAlguna,porcentaje:pct(conAlguna)}
    },
    solicitudes:{
      algunaGeolocalizable:{cantidad:solicitudesAlguna,porcentaje:pct(solicitudesAlguna,totalSolicitudes)},
      todosPrediosGeolocalizables:{cantidad:solicitudesTodas,porcentaje:pct(solicitudesTodas,totalSolicitudes)}
    },
    interpretacion:{
      coberturaGeografica:pct(conAlguna), sinGeometria:pct(ninguna),
      fuenteOperacional:"mi_base.duckdb", fuenteGeoespacial:"sigcra.duckdb"
    }
  };
  return qualityCoverageCache;
}

app.get("/api/calidad-datos", async (_req, res) => {
  try {
    const data = await computeQualityCoverage();
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error("Error calculando calidad de datos:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/calidad-datos/refrescar", async (_req, res) => {
  try {
    qualityCoverageCache = null;
    const data = await computeQualityCoverage();
    res.json({ ok: true, ...data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const [a] = await q(saff, `SELECT COUNT(*)::INTEGER AS tablas FROM duckdb_tables() WHERE internal=false`);
    const [b] = await q(sigcra, `SELECT COUNT(*)::INTEGER AS tablas FROM duckdb_tables() WHERE internal=false`);
    res.json({ ok: true, saff: { database: SAFF_DB_PATH, tablas: a.tablas }, sigcra: { database: SIGCRA_DB_PATH, tablas: b.tablas } });
  } catch (error) { res.status(500).json({ ok:false, error:error.message }); }
});

app.get("/api/predios/:codigo/geometria", async (req, res) => {
  try {
    const codigo = Number(req.params.codigo);
    const [geo, subdivisiones] = await Promise.all([getGeo(codigo), getSubdivisionInfo(codigo)]);
    res.json({ ok:true, predCodigo:codigo, geo, subdivisiones });
  } catch (error) { res.status(500).json({ ok:false, error:error.message }); }
});

app.get("/api/ejemplos", async (_req, res) => {
  try {
    const [solicitudes, predios, propietarios] = await Promise.all([
      q(saff, `
        SELECT s.SOLI_NUMERO, s.SOLI_NUMERO_DISP, ts.TISO_DESCRIPCION AS TIPO_SOLICITUD
        FROM SOLICITUD s
        LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO=s.TISO_CODIGO
        WHERE s.SOLI_NUMERO IS NOT NULL
          AND EXISTS (SELECT 1 FROM PREDIOSOLICITUD ps WHERE ps.SOLI_NUMERO=s.SOLI_NUMERO)
        ORDER BY ${safeDateExpr("s.SOLI_FECHA_INGRESO")} DESC NULLS LAST, s.SOLI_NUMERO DESC
        LIMIT 2
      `),
      q(saff, `
        SELECT p.PRED_CODIGO, p.PRED_NOMBRE, r.ROLES
        FROM PREDIO p
        LEFT JOIN (
          SELECT PRED_CODIGO, STRING_AGG(DISTINCT ROL_NUMERO, ', ') AS ROLES
          FROM ROL GROUP BY PRED_CODIGO
        ) r ON r.PRED_CODIGO=p.PRED_CODIGO
        WHERE p.PRED_CODIGO IS NOT NULL
          AND p.PRED_NOMBRE IS NOT NULL
          AND TRIM(p.PRED_NOMBRE)<>''
          AND EXISTS (SELECT 1 FROM PREDIOSOLICITUD ps WHERE ps.PRED_CODIGO=p.PRED_CODIGO)
        ORDER BY p.PRED_CODIGO DESC
        LIMIT 2
      `),
      q(saff, `
        SELECT DISTINCT pe.PERS_CODIGO, pe.PERS_RUT, pe.PERS_DV, ${ownerName("pe")} AS NOMBRE_COMPLETO
        FROM PROPIETARIO pr
        JOIN PERSONA pe ON pe.PERS_CODIGO=pr.PERS_CODIGO
        WHERE pe.PERS_CODIGO IS NOT NULL
          AND COALESCE(TRIM(${ownerName("pe")}), '') <> ''
        ORDER BY pe.PERS_CODIGO DESC
        LIMIT 2
      `)
    ]);
    res.json({ ok:true, solicitud:solicitudes, predio:predios, propietario:propietarios });
  } catch (error) {
    console.error("Error cargando ejemplos:", error);
    res.status(500).json({ ok:false, error:error.message });
  }
});

app.get("/api/solicitudes/:termino", async (req, res) => {
  const termino = req.params.termino.trim();
  try {
    const solicitudes = await q(saff, `
      SELECT s.SOLI_NUMERO, s.SOLI_NUMERO_DISP,
        ${safeDateExpr("s.SOLI_FECHA_INGRESO")} AS FECHA_INGRESO,
        EXTRACT(YEAR FROM ${safeDateExpr("s.SOLI_FECHA_INGRESO")})::INTEGER AS ANO_SOLICITUD,
        ${safeDateExpr("s.SOLI_FECHA_RESOLUCION")} AS FECHA_RESOLUCION,
        s.SOLI_NRO_RESOLUCION, s.SOLI_SUP_SOLICITADA, s.SOLI_SUP_APROBADA, s.SOLI_SUP_VIGENTE,
        ts.TISO_DESCRIPCION AS TIPO_SOLICITUD, e.ESTA_DESCRIPCION AS ESTADO
      FROM SOLICITUD s
      LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO=s.TISO_CODIGO
      LEFT JOIN ESTADO e ON e.ESTA_CODIGO=s.ESTA_CODIGO
      WHERE CAST(s.SOLI_NUMERO AS VARCHAR)=? OR UPPER(COALESCE(s.SOLI_NUMERO_DISP,''))=UPPER(?) LIMIT 20
    `,[termino,termino]);
    if (!solicitudes.length) return res.status(404).json({ok:false,message:"Solicitud no encontrada"});

    const results=[];
    for (const solicitud of solicitudes) {
      const numero=Number(solicitud.SOLI_NUMERO);
      let predios=await q(saff, `
        SELECT DISTINCT p.PRED_CODIGO,p.PRED_NOMBRE,p.PRED_SUPERFICIE,p.PRED_UBICACION,p.PRED_REGISTRO,p.PRED_REGISTRO_BN,
          l.LOCA_CODIGO,l.LOCA_DESCRIPCION AS LOCALIDAD,l.LOCA_TIPO AS TIPO_LOCALIDAD,r.ROLES
        FROM PREDIOSOLICITUD ps JOIN PREDIO p ON p.PRED_CODIGO=ps.PRED_CODIGO
        LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO=p.LOCA_CODIGO
        LEFT JOIN (SELECT PRED_CODIGO,STRING_AGG(DISTINCT ROL_NUMERO,', ') AS ROLES FROM ROL GROUP BY PRED_CODIGO) r ON r.PRED_CODIGO=p.PRED_CODIGO
        WHERE ps.SOLI_NUMERO=? ORDER BY p.PRED_NOMBRE`,[numero]);
      predios = await Promise.all(predios.map(enrichPredio));
      const propietarios=await q(saff, `
        SELECT DISTINCT pe.PERS_CODIGO,pe.PERS_RUT,pe.PERS_DV,${ownerName("pe")} AS NOMBRE_COMPLETO,pe.PERS_EMAIL,pe.PERS_TELEFONO
        FROM PROPIETARIO pr JOIN PERSONA pe ON pe.PERS_CODIGO=pr.PERS_CODIGO
        WHERE pr.SOLI_NUMERO=? ORDER BY NOMBRE_COMPLETO`,[numero]);
      const expediente=await getSolicitudExpediente(numero);
      results.push({solicitud,predios,propietarios,expediente});
    }
    res.json({ok:true,results});
  } catch(error){console.error(error);res.status(500).json({ok:false,error:error.message});}
});

app.get("/api/predios", async (req,res)=>{
  const term=String(req.query.q||"").trim();
  if(!term) return res.status(400).json({ok:false,message:"Falta q"});
  try{
    let predios=await q(saff, `
      SELECT DISTINCT p.PRED_CODIGO,p.PRED_NOMBRE,p.PRED_SUPERFICIE,p.PRED_UBICACION,p.PRED_REGISTRO,p.PRED_REGISTRO_BN,
        l.LOCA_CODIGO,l.LOCA_DESCRIPCION AS LOCALIDAD,l.LOCA_TIPO AS TIPO_LOCALIDAD,r.ROLES
      FROM PREDIO p LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO=p.LOCA_CODIGO
      LEFT JOIN (SELECT PRED_CODIGO,STRING_AGG(DISTINCT ROL_NUMERO,', ') AS ROLES FROM ROL GROUP BY PRED_CODIGO) r ON r.PRED_CODIGO=p.PRED_CODIGO
      WHERE CAST(p.PRED_CODIGO AS VARCHAR)=? OR UPPER(COALESCE(p.PRED_NOMBRE,'')) LIKE '%'||UPPER(?)||'%'
        OR EXISTS(SELECT 1 FROM ROL rx WHERE rx.PRED_CODIGO=p.PRED_CODIGO AND UPPER(COALESCE(rx.ROL_NUMERO,'')) LIKE '%'||UPPER(?)||'%')
      ORDER BY p.PRED_NOMBRE LIMIT 50`,[term,term,term]);
    const results=[];
    for(const raw of predios){
      const predio=await enrichPredio(raw); const codigo=Number(predio.PRED_CODIGO);
      const solicitudes=await q(saff, `
        SELECT DISTINCT s.SOLI_NUMERO,s.SOLI_NUMERO_DISP,${safeDateExpr("s.SOLI_FECHA_INGRESO")} AS FECHA_INGRESO,
          EXTRACT(YEAR FROM ${safeDateExpr("s.SOLI_FECHA_INGRESO")})::INTEGER AS ANO_SOLICITUD,
          ${safeDateExpr("s.SOLI_FECHA_RESOLUCION")} AS FECHA_RESOLUCION,s.SOLI_NRO_RESOLUCION,s.SOLI_SUP_SOLICITADA,s.SOLI_SUP_APROBADA,
          ts.TISO_DESCRIPCION AS TIPO_SOLICITUD,e.ESTA_DESCRIPCION AS ESTADO,
          STRING_AGG(DISTINCT NULLIF(${ownerName("pe")},''),' | ') AS PROPIETARIOS
        FROM PREDIOSOLICITUD ps JOIN SOLICITUD s ON s.SOLI_NUMERO=ps.SOLI_NUMERO
        LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO=s.TISO_CODIGO LEFT JOIN ESTADO e ON e.ESTA_CODIGO=s.ESTA_CODIGO
        LEFT JOIN PROPIETARIO pr ON pr.SOLI_NUMERO=s.SOLI_NUMERO LEFT JOIN PERSONA pe ON pe.PERS_CODIGO=pr.PERS_CODIGO
        WHERE ps.PRED_CODIGO=? GROUP BY s.SOLI_NUMERO,s.SOLI_NUMERO_DISP,s.SOLI_FECHA_INGRESO,s.SOLI_FECHA_RESOLUCION,s.SOLI_NRO_RESOLUCION,
          s.SOLI_SUP_SOLICITADA,s.SOLI_SUP_APROBADA,ts.TISO_DESCRIPCION,e.ESTA_DESCRIPCION ORDER BY FECHA_INGRESO DESC NULLS LAST`,[codigo]);
      const propietariosPredio=await q(saff, `SELECT DISTINCT pe.PERS_CODIGO,pe.PERS_RUT,pe.PERS_DV,${ownerName("pe")} AS NOMBRE_COMPLETO
        FROM PROPIETARIOPREDIO pp JOIN PERSONA pe ON pe.PERS_CODIGO=pp.PERS_CODIGO WHERE pp.PRED_CODIGO=? ORDER BY NOMBRE_COMPLETO`,[codigo]);
      results.push({predio,propietariosPredio,solicitudes});
    }
    res.json({ok:true,results});
  }catch(error){console.error(error);res.status(500).json({ok:false,error:error.message});}
});

app.get("/api/propietarios", async(req,res)=>{
  const term=String(req.query.q||"").trim(); if(!term) return res.status(400).json({ok:false,message:"Falta q"});
  try{
    const propietarios=await q(saff, `SELECT pe.PERS_CODIGO,pe.PERS_RUT,pe.PERS_DV,${ownerName("pe")} AS NOMBRE_COMPLETO,pe.PERS_EMAIL,pe.PERS_TELEFONO
      FROM PERSONA pe WHERE CAST(pe.PERS_RUT AS VARCHAR)=REPLACE(REPLACE(? ,'.',''),'-','') OR UPPER(${ownerName("pe")}) LIKE '%'||UPPER(?)||'%'
      ORDER BY NOMBRE_COMPLETO LIMIT 50`,[term,term]);
    const results=[];
    for(const propietario of propietarios){
      const id=Number(propietario.PERS_CODIGO);
      let predios=await q(saff, `SELECT DISTINCT p.PRED_CODIGO,p.PRED_NOMBRE,p.PRED_SUPERFICIE,p.PRED_UBICACION,l.LOCA_DESCRIPCION AS LOCALIDAD,r.ROLES
        FROM PROPIETARIOPREDIO pp JOIN PREDIO p ON p.PRED_CODIGO=pp.PRED_CODIGO LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO=p.LOCA_CODIGO
        LEFT JOIN (SELECT PRED_CODIGO,STRING_AGG(DISTINCT ROL_NUMERO,', ') AS ROLES FROM ROL GROUP BY PRED_CODIGO) r ON r.PRED_CODIGO=p.PRED_CODIGO
        WHERE pp.PERS_CODIGO=? ORDER BY p.PRED_NOMBRE`,[id]);
      predios=await Promise.all(predios.map(enrichPredio));
      const solicitudes=await q(saff, `SELECT DISTINCT s.SOLI_NUMERO,s.SOLI_NUMERO_DISP,${safeDateExpr("s.SOLI_FECHA_INGRESO")} AS FECHA_INGRESO,
        EXTRACT(YEAR FROM ${safeDateExpr("s.SOLI_FECHA_INGRESO")})::INTEGER AS ANO_SOLICITUD,ts.TISO_DESCRIPCION AS TIPO_SOLICITUD,e.ESTA_DESCRIPCION AS ESTADO,
        p.PRED_CODIGO,p.PRED_NOMBRE,p.PRED_SUPERFICIE,l.LOCA_DESCRIPCION AS LOCALIDAD
        FROM PROPIETARIO pr JOIN SOLICITUD s ON s.SOLI_NUMERO=pr.SOLI_NUMERO LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO=s.TISO_CODIGO
        LEFT JOIN ESTADO e ON e.ESTA_CODIGO=s.ESTA_CODIGO LEFT JOIN PREDIOSOLICITUD ps ON ps.SOLI_NUMERO=s.SOLI_NUMERO LEFT JOIN PREDIO p ON p.PRED_CODIGO=ps.PRED_CODIGO
        LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO=p.LOCA_CODIGO WHERE pr.PERS_CODIGO=? ORDER BY FECHA_INGRESO DESC NULLS LAST`,[id]);
      results.push({propietario,predios,solicitudes});
    }
    res.json({ok:true,results});
  }catch(error){console.error(error);res.status(500).json({ok:false,error:error.message});}
});

app.listen(PORT,()=>{
  console.log(`SAFF + SIGCRA API: http://localhost:${PORT}`);
  console.log(`SAFF: ${SAFF_DB_PATH}`);
  console.log(`SIGCRA: ${SIGCRA_DB_PATH}`);
});
