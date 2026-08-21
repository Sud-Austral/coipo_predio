import { useMemo, useState } from "react";
import {
  Search, FileText, MapPinned, UserRound, CalendarDays,
  Trees, Hash, MapPin, Ruler, BadgeCheck, ChevronRight,
  Database, AlertCircle
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const modes = [
  { id: "solicitud", label: "Solicitud", icon: FileText, placeholder: "N° de solicitud..." },
  { id: "predio", label: "Predio", icon: MapPinned, placeholder: "Nombre, código o rol del predio..." },
  { id: "propietario", label: "Propietario", icon: UserRound, placeholder: "RUT, nombre o apellido..." },
];

function formatNum(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("es-CL", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

function Rut({ rut, dv }) {
  if (!rut) return <>—</>;
  return <>{formatNum(rut, 0).replaceAll(".", ".")}{dv ? `-${dv}` : ""}</>;
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric">
      <div className="metricIcon"><Icon size={18} /></div>
      <div>
        <div className="metricLabel">{label}</div>
        <div className="metricValue">{value ?? "—"}</div>
      </div>
    </div>
  );
}

function Status({ children }) {
  if (!children) return <span className="badge muted">Sin estado</span>;
  return <span className="badge">{children}</span>;
}

function SolicitudCard({ item }) {
  const s = item.solicitud;
  return (
    <section className="resultCard">
      <div className="cardTitleRow">
        <div>
          <div className="eyebrow">Solicitud</div>
          <h2>{s.SOLI_NUMERO_DISP || s.SOLI_NUMERO}</h2>
        </div>
        <Status>{s.ESTADO}</Status>
      </div>

      <div className="metricsGrid">
        <Metric icon={CalendarDays} label="Año" value={s.ANO_SOLICITUD} />
        <Metric icon={FileText} label="Tipo" value={s.TIPO_SOLICITUD} />
        <Metric icon={Ruler} label="Sup. solicitada" value={`${formatNum(s.SOLI_SUP_SOLICITADA)} ha`} />
        <Metric icon={BadgeCheck} label="Sup. aprobada" value={`${formatNum(s.SOLI_SUP_APROBADA)} ha`} />
      </div>

      <div className="twoCols">
        <div>
          <h3>Predio asociado</h3>
          <div className="stack">
            {item.predios.map(p => (
              <div className="subcard" key={p.PRED_CODIGO}>
                <div className="subcardTop">
                  <strong>{p.PRED_NOMBRE || "Predio sin nombre"}</strong>
                  <span>#{p.PRED_CODIGO}</span>
                </div>
                <div className="smallGrid">
                  <span><MapPin size={14}/> {p.LOCALIDAD || "Sin localidad"}</span>
                  <span><Ruler size={14}/> {formatNum(p.PRED_SUPERFICIE)} ha</span>
                  <span><Hash size={14}/> Rol {p.ROLES || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Propietario</h3>
          <div className="stack">
            {item.propietarios.map(p => (
              <div className="subcard" key={p.PERS_CODIGO}>
                <strong>{p.NOMBRE_COMPLETO || "Sin nombre"}</strong>
                <div className="subtle">RUT <Rut rut={p.PERS_RUT} dv={p.PERS_DV}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PredioCard({ item }) {
  const p = item.predio;
  return (
    <section className="resultCard">
      <div className="cardTitleRow">
        <div>
          <div className="eyebrow">Predio</div>
          <h2>{p.PRED_NOMBRE || "Predio sin nombre"}</h2>
          <div className="subtle">Código {p.PRED_CODIGO} · Rol {p.ROLES || "—"}</div>
        </div>
      </div>

      <div className="metricsGrid">
        <Metric icon={Ruler} label="Superficie" value={`${formatNum(p.PRED_SUPERFICIE)} ha`} />
        <Metric icon={MapPin} label="Localidad" value={p.LOCALIDAD || "—"} />
        <Metric icon={FileText} label="Solicitudes" value={item.solicitudes.length} />
        <Metric icon={UserRound} label="Propietarios registrados" value={item.propietariosPredio.length} />
      </div>

      <h3>Historial de solicitudes</h3>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Año</th><th>Solicitud</th><th>Tipo</th><th>Estado</th>
              <th>Propietario</th><th>Sup. solicitada</th><th>Sup. aprobada</th>
            </tr>
          </thead>
          <tbody>
            {item.solicitudes.map((s, i) => (
              <tr key={`${s.SOLI_NUMERO}-${i}`}>
                <td>{s.ANO_SOLICITUD || "—"}</td>
                <td><strong>{s.SOLI_NUMERO_DISP || s.SOLI_NUMERO}</strong></td>
                <td>{s.TIPO_SOLICITUD || "—"}</td>
                <td><Status>{s.ESTADO}</Status></td>
                <td>{s.PROPIETARIOS || "—"}</td>
                <td>{formatNum(s.SOLI_SUP_SOLICITADA)} ha</td>
                <td>{formatNum(s.SOLI_SUP_APROBADA)} ha</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PropietarioCard({ item }) {
  const p = item.propietario;
  return (
    <section className="resultCard">
      <div className="cardTitleRow">
        <div>
          <div className="eyebrow">Propietario</div>
          <h2>{p.NOMBRE_COMPLETO || "Sin nombre"}</h2>
          <div className="subtle">RUT <Rut rut={p.PERS_RUT} dv={p.PERS_DV}/></div>
        </div>
      </div>

      <div className="metricsGrid">
        <Metric icon={Trees} label="Predios registrados" value={item.predios.length} />
        <Metric icon={FileText} label="Solicitudes" value={item.solicitudes.length} />
        <Metric icon={MapPin} label="Localidades" value={new Set(item.predios.map(x => x.LOCALIDAD).filter(Boolean)).size} />
        <Metric icon={Ruler} label="Superficie registrada" value={`${formatNum(item.predios.reduce((a,b)=>a+(Number(b.PRED_SUPERFICIE)||0),0))} ha`} />
      </div>

      <h3>Predios</h3>
      <div className="predioGrid">
        {item.predios.map(pr => (
          <div className="subcard" key={pr.PRED_CODIGO}>
            <div className="subcardTop">
              <strong>{pr.PRED_NOMBRE || "Predio sin nombre"}</strong>
              <span>#{pr.PRED_CODIGO}</span>
            </div>
            <div className="smallGrid">
              <span><MapPin size={14}/> {pr.LOCALIDAD || "—"}</span>
              <span><Ruler size={14}/> {formatNum(pr.PRED_SUPERFICIE)} ha</span>
              <span><Hash size={14}/> Rol {pr.ROLES || "—"}</span>
            </div>
          </div>
        ))}
      </div>

      <h3>Solicitudes</h3>
      <div className="tableWrap">
        <table>
          <thead>
            <tr><th>Año</th><th>Solicitud</th><th>Predio</th><th>Tipo</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {item.solicitudes.map((s, i) => (
              <tr key={`${s.SOLI_NUMERO}-${s.PRED_CODIGO}-${i}`}>
                <td>{s.ANO_SOLICITUD || "—"}</td>
                <td><strong>{s.SOLI_NUMERO_DISP || s.SOLI_NUMERO}</strong></td>
                <td>{s.PRED_NOMBRE || "—"}</td>
                <td>{s.TIPO_SOLICITUD || "—"}</td>
                <td><Status>{s.ESTADO}</Status></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  const [mode, setMode] = useState("solicitud");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const current = useMemo(() => modes.find(m => m.id === mode), [mode]);

  async function search(e) {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setData(null);

    const url =
      mode === "solicitud"
        ? `${API}/api/solicitudes/${encodeURIComponent(query.trim())}`
        : `${API}/api/${mode === "predio" ? "predios" : "propietarios"}?q=${encodeURIComponent(query.trim())}`;

    try {
      const response = await fetch(url);
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || json.error || "No se pudo completar la búsqueda");
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandMark"><Trees size={22}/></div>
          <div>
            <strong>Consulta Predial</strong>
            <span>SAFF · Explorador de antecedentes</span>
          </div>
        </div>
        <div className="db"><Database size={15}/> DuckDB local</div>
      </header>

      <div className="page">
        <section className="hero">
          <div className="eyebrow">Búsqueda integrada</div>
          <h1>Encuentra la historia de una solicitud, predio o propietario.</h1>
          <p>Consulta relaciones históricas sin navegar por múltiples módulos del sistema.</p>

          <div className="modeTabs">
            {modes.map(m => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  className={mode === m.id ? "mode active" : "mode"}
                  onClick={() => { setMode(m.id); setData(null); setError(""); }}
                >
                  <Icon size={17}/> {m.label}
                </button>
              );
            })}
          </div>

          <form className="searchBox" onSubmit={search}>
            <Search size={21}/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={current.placeholder}
              autoFocus
            />
            <button disabled={loading}>
              {loading ? "Buscando..." : "Buscar"} <ChevronRight size={17}/>
            </button>
          </form>
        </section>

        {!data && !error && !loading && (
          <section className="empty">
            <Search size={26}/>
            <strong>Comienza con una búsqueda</strong>
            <span>
              {mode === "solicitud" && "Ingresa el número de una solicitud."}
              {mode === "predio" && "Busca por nombre, código o rol del predio."}
              {mode === "propietario" && "Busca por RUT, nombre o apellido."}
            </span>
          </section>
        )}

        {error && (
          <section className="error">
            <AlertCircle size={20}/><div><strong>No encontramos resultados</strong><span>{error}</span></div>
          </section>
        )}

        {data?.results?.length > 0 && (
          <section className="results">
            <div className="resultCount">{data.results.length} resultado(s)</div>
            {mode === "solicitud" && data.results.map((x,i) => <SolicitudCard item={x} key={i}/>)}
            {mode === "predio" && data.results.map((x,i) => <PredioCard item={x} key={i}/>)}
            {mode === "propietario" && data.results.map((x,i) => <PropietarioCard item={x} key={i}/>)}
          </section>
        )}
      </div>
    </main>
  );
}