export const API_URL = (import.meta.env.VITE_API_URL || "").trim();
export const DEMO_MODE = !API_URL;

let demoCache = null;

async function getDemo() {
  if (demoCache) return demoCache;
  const base = import.meta.env.BASE_URL || "./";
  const response = await fetch(`${base}demo-data.json`);
  if (!response.ok) throw new Error("No se pudo cargar demo-data.json");
  demoCache = await response.json();
  return demoCache;
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ownersForPredio(demo, predCodigo) {
  return uniqBy(
    (demo.propietarios || []).filter(p => String(p.PRED_CODIGO) === String(predCodigo)),
    p => String(p.PERS_CODIGO ?? p.PERS_RUT ?? p.NOMBRE_COMPLETO)
  );
}

function solicitudesForPredio(demo, predCodigo) {
  return uniqBy(
    (demo.solicitudes || []).filter(s => String(s.PRED_CODIGO) === String(predCodigo)),
    s => String(s.SOLI_NUMERO)
  );
}

function predioResult(predio, demo) {
  return {
    predio,
    solicitudes: solicitudesForPredio(demo, predio.PRED_CODIGO),
    propietariosPredio: ownersForPredio(demo, predio.PRED_CODIGO)
  };
}

function solicitudResult(solicitud, demo) {
  const same = (demo.solicitudes || []).filter(s => String(s.SOLI_NUMERO) === String(solicitud.SOLI_NUMERO));
  const predCodes = [...new Set(same.map(s => String(s.PRED_CODIGO)).filter(Boolean))];
  const predios = (demo.predios || []).filter(p => predCodes.includes(String(p.PRED_CODIGO)));
  const propietarios = uniqBy(
    predios.flatMap(p => ownersForPredio(demo, p.PRED_CODIGO)),
    p => String(p.PERS_CODIGO ?? p.PERS_RUT ?? p.NOMBRE_COMPLETO)
  );

  return {
    solicitud,
    predios,
    propietarios,
    expediente: { grupos: {} }
  };
}

function propietarioResult(propietario, demo) {
  const rows = (demo.propietarios || []).filter(p =>
    String(p.PERS_CODIGO ?? p.PERS_RUT ?? p.NOMBRE_COMPLETO) ===
    String(propietario.PERS_CODIGO ?? propietario.PERS_RUT ?? propietario.NOMBRE_COMPLETO)
  );
  const predCodes = [...new Set(rows.map(r => String(r.PRED_CODIGO)).filter(Boolean))];
  const predios = (demo.predios || []).filter(p => predCodes.includes(String(p.PRED_CODIGO)));
  const solicitudes = uniqBy(
    predios.flatMap(p => solicitudesForPredio(demo, p.PRED_CODIGO)).map(s => {
      const pred = predios.find(p => String(p.PRED_CODIGO) === String(s.PRED_CODIGO));
      return { ...s, PRED_NOMBRE: pred?.PRED_NOMBRE };
    }),
    s => `${s.SOLI_NUMERO}-${s.PRED_CODIGO}`
  );
  return { propietario, predios, solicitudes };
}

export async function examples(mode) {
  if (!DEMO_MODE) {
    const r = await fetch(`${API_URL}/api/ejemplos`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudieron cargar ejemplos");
    return j[mode] || [];
  }

  const demo = await getDemo();
  if (mode === "predio") return (demo.predios || []).slice(0, 2);
  if (mode === "solicitud") {
    return uniqBy(demo.solicitudes || [], s => String(s.SOLI_NUMERO)).slice(0, 2);
  }
  if (mode === "propietario") {
    return uniqBy(
      demo.propietarios || [],
      p => String(p.PERS_CODIGO ?? p.PERS_RUT ?? p.NOMBRE_COMPLETO)
    ).slice(0, 2);
  }
  return [];
}

export async function searchData(mode, query) {
  if (!DEMO_MODE) {
    const url = mode === "solicitud"
      ? `${API_URL}/api/solicitudes/${encodeURIComponent(query.trim())}`
      : `${API_URL}/api/${mode === "predio" ? "predios" : "propietarios"}?q=${encodeURIComponent(query.trim())}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || "No se pudo completar la búsqueda");
    return j;
  }

  const demo = await getDemo();
  const q = norm(query);

  if (mode === "predio") {
    const matches = (demo.predios || []).filter(p =>
      norm(p.PRED_CODIGO).includes(q) ||
      norm(p.PRED_NOMBRE).includes(q) ||
      norm(p.LOCALIDAD).includes(q) ||
      norm(p.ROLES).includes(q)
    );
    return { ok: true, results: matches.map(p => predioResult(p, demo)) };
  }

  if (mode === "solicitud") {
    const matches = uniqBy(
      (demo.solicitudes || []).filter(s =>
        norm(s.SOLI_NUMERO).includes(q) ||
        norm(s.SOLI_NUMERO_DISP).includes(q) ||
        norm(s.TIPO_SOLICITUD).includes(q)
      ),
      s => String(s.SOLI_NUMERO)
    );
    return { ok: true, results: matches.map(s => solicitudResult(s, demo)) };
  }

  const matches = uniqBy(
    (demo.propietarios || []).filter(p =>
      norm(p.PERS_RUT).includes(q) ||
      norm(p.NOMBRE_COMPLETO).includes(q)
    ),
    p => String(p.PERS_CODIGO ?? p.PERS_RUT ?? p.NOMBRE_COMPLETO)
  );
  return { ok: true, results: matches.map(p => propietarioResult(p, demo)) };
}

export async function qualityData() {
  if (!DEMO_MODE) {
    const r = await fetch(`${API_URL}/api/calidad-datos`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo cargar calidad");
    return j;
  }
  const demo = await getDemo();
  return { demo: true, ...demo.quality, meta: demo.meta };
}
