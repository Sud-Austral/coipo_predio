import { useEffect, useMemo, useState } from "react";
import { DEMO_MODE, examples, searchData, qualityData } from "./api.js";
import { MapContainer, TileLayer, Polygon, LayersControl, LayerGroup, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Search, FileText, MapPinned, UserRound, CalendarDays, Trees, Hash,
  MapPin, Ruler, BadgeCheck, ChevronRight, Database, AlertCircle, Layers3, ShieldCheck, RefreshCw, BarChart3, ClipboardList, FolderOpen, Clock3
} from "lucide-react";

const modes = [
  { id: "solicitud", label: "Solicitud", icon: FileText, placeholder: "N° de solicitud..." },
  { id: "predio", label: "Predio", icon: MapPinned, placeholder: "Nombre, código o rol del predio..." },
  { id: "propietario", label: "Propietario", icon: UserRound, placeholder: "RUT, nombre o apellido..." },
];

function formatNum(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value); if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("es-CL", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

function Rut({ rut, dv }) {
  if (!rut) return <>—</>;
  return <>{formatNum(rut, 0)}{dv ? `-${dv}` : ""}</>;
}

function Metric({ icon: Icon, label, value }) {
  return <div className="metric"><div className="metricIcon"><Icon size={18}/></div><div><div className="metricLabel">{label}</div><div className="metricValue">{value ?? "—"}</div></div></div>;
}

function Status({ children }) {
  if (!children) return <span className="badge muted">Sin estado</span>;
  return <span className="badge">{children}</span>;
}

function FitGeometry({ features }) {
  const map = useMap();
  useMemo(() => {
    const pts = features.flatMap(f => f.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon]);
    if (pts.length) setTimeout(() => map.fitBounds(pts, { padding: [24, 24] }), 0);
  }, [features, map]);
  return null;
}

function PredioMap({ predio, selectedRodal, onSelectRodal }) {
  const geo = predio?.geo;
  const rodales = predio?.subdivisiones?.rodales || [];
  const rodalFeatures = predio?.rodalGeo?.features || [];

  if (!geo?.available || !geo.features?.length) {
    return <div className="mapEmpty">
      <MapPinned size={24}/>
      <strong>Sin geometría predial disponible</strong>
      <span>{rodales.length
        ? `SAFF registra ${rodales.length} rodal(es), pero todavía no encontramos coordenadas confiables para dibujarlos.`
        : "No encontramos un polígono utilizable en SIGCRA para este predio."}</span>
    </div>;
  }

  const center = geo.center || [-33.45, -70.66];
  return <div className="mapPanel">
    <MapContainer center={center} zoom={16} scrollWheelZoom={true} className="leafletMap">
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Mapa base">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Relieve">
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satélite">
          <TileLayer attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay checked name="Predio">
          <LayerGroup>
            {geo.features.map((f, i) => {
              const positions = (f.geometry.coordinates[0] || []).map(([lon, lat]) => [lat, lon]);
              return <Polygon
                key={`predio-${i}`}
                positions={positions}
                pathOptions={{ weight: f.properties.role === "predio" ? 4 : 3, fillOpacity: 0.14 }}
              >
                <Popup>
                  <div className="mapPopup">
                    <strong>{predio.PRED_NOMBRE || "Predio"}</strong>
                    <span>Código {predio.PRED_CODIGO}</span>
                    <span>{f.properties?.label || "Geometría SIGCRA"}</span>
                    <span>{Number(f.properties?.crossings || 0) === 0 ? "Sin cruces detectados" : "Geometría a revisar"}</span>
                  </div>
                </Popup>
              </Polygon>;
            })}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name={`Rodales (${rodales.length})`}>
          <LayerGroup>
            {rodalFeatures.map((f, i) => {
              const positions = (f.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon]);
              if (positions.length < 3) return null;
              return <Polygon
                key={`rodal-${i}`}
                positions={positions}
                pathOptions={{ weight: selectedRodal && String(selectedRodal.RODA_CODIGO) === String(f.properties?.RODA_CODIGO) ? 5 : 2, fillOpacity: 0.22 }}
                eventHandlers={{ click: () => {
                  const target = rodales.find(r => String(r.RODA_CODIGO) === String(f.properties?.RODA_CODIGO));
                  if (target) onSelectRodal?.(target);
                }}}
              >
                <Popup>
                  <div className="mapPopup">
                    <strong>Rodal {f.properties?.RODA_NUMERO ?? f.properties?.RODA_CODIGO ?? i + 1}</strong>
                    <span>{f.properties?.RODA_SUPERFICIE != null ? `${formatNum(f.properties.RODA_SUPERFICIE)} ha` : "Superficie no disponible"}</span>
                  </div>
                </Popup>
              </Polygon>;
            })}
          </LayerGroup>
        </LayersControl.Overlay>
      </LayersControl>

      <FitGeometry features={geo.features}/>
    </MapContainer>

    <div className="mapMeta">
      <span><Database size={13}/> Predio: {geo.source || "fuente geográfica"}</span>
      <span><MapPin size={13}/> {geo.pointCount} puntos</span>
      <span><Layers3 size={13}/> Rodales SAFF: {rodales.length}</span>
      <span><ShieldCheck size={13}/> {geo.features.every(f=>Number(f.properties?.crossings||0)===0) ? "Sin cruces detectados" : "Revisar cruces"}</span>
    </div>

    {rodales.length > 0 && rodalFeatures.length === 0 && <div className="rodalGeoNotice">
      <Layers3 size={16}/>
      <div><strong>Capa Rodales preparada</strong><span>Los rodales existen en SAFF, pero aún no tienen geometría confiable asociada. Se pueden seleccionar en el listado sin dibujar límites ficticios.</span></div>
    </div>}
  </div>;
}

function SubdivisionSummary({ predio, selectedRodal, onSelectRodal }) {
  const s = predio?.subdivisiones;
  if (!s) return null;
  const rodales = s.rodales || [];
  return <div className="subdivisionArea">
    <div className="subdivisionStrip">
      <span><strong>{s.sectores?.length || 0}</strong> sectores SAFF</span>
      <span><strong>{rodales.length}</strong> rodales SAFF</span>
      <span><strong>{s.areas?.length || 0}</strong> áreas SAFF</span>
    </div>

    {rodales.length > 0 && <div className="rodalLayerBrowser">
      <div className="rodalBrowserHead">
        <div><strong>Capa Rodales</strong><span>Selecciona un rodal para revisar sus atributos.</span></div>
        <small>Geometría: pendiente de fuente confiable</small>
      </div>
      <div className="rodalChips">
        {rodales.slice(0, 60).map((r, i) => {
          const active = selectedRodal && String(selectedRodal.RODA_CODIGO) === String(r.RODA_CODIGO);
          return <button type="button" key={r.RODA_CODIGO || i} className={active ? "rodalChip active" : "rodalChip"} onClick={()=>onSelectRodal?.(r)}>
            Rodal {r.RODA_NUMERO ?? i + 1}
          </button>;
        })}
      </div>
      {rodales.length > 60 && <div className="rodalMore">Mostrando 60 de {rodales.length} rodales.</div>}
      {selectedRodal && <div className="rodalDetail">
        <div><span>Rodal</span><strong>{selectedRodal.RODA_NUMERO ?? "—"}</strong></div>
        <div><span>Superficie</span><strong>{selectedRodal.RODA_SUPERFICIE != null ? `${formatNum(selectedRodal.RODA_SUPERFICIE)} ha` : "—"}</strong></div>
        <div><span>Año plantación</span><strong>{selectedRodal.RODA_ANO_PLANTACION || "—"}</strong></div>
        <div><span>Vigente</span><strong>{Number(selectedRodal.RODA_VIGENTE) === 1 ? "Sí" : Number(selectedRodal.RODA_VIGENTE) === 0 ? "No" : "—"}</strong></div>
        <div><span>RODA_CODIGO</span><strong>{selectedRodal.RODA_CODIGO ?? "—"}</strong></div>
      </div>}
    </div>}
  </div>;
}

function PredioVisual({ predio }) {
  const [selectedRodal, setSelectedRodal] = useState(null);
  useEffect(() => { setSelectedRodal(null); }, [predio?.PRED_CODIGO]);
  return <div className="visualBlock">
    <PredioMap predio={predio} selectedRodal={selectedRodal} onSelectRodal={setSelectedRodal}/>
    <SubdivisionSummary predio={predio} selectedRodal={selectedRodal} onSelectRodal={setSelectedRodal}/>
  </div>;
}


function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("es-CL");
}

function SolicitudFicha({ item }) {
  const s=item.solicitud;
  const exp=item.expediente;
  const groups=exp?.grupos || {};
  const order=[
    ["FICHA","Ficha"], ["RESOLUCIONES","Resoluciones"], ["INFORMES","Informes"],
    ["ACTIVIDADES","Actividades"], ["OBSERVACIONES","Observaciones"], ["DOCUMENTOS_ANEXOS","Posibles anexos / documentos"]
  ];
  return <div className="solicitudFicha">
    <div className="fichaMain">
      <div className="eyebrow">Ficha de solicitud</div>
      <h2>{s.SOLI_NUMERO_DISP || s.SOLI_NUMERO}</h2>
      <div className="fichaRows">
        <div><span>SOLI_NUMERO</span><strong>{s.SOLI_NUMERO}</strong></div>
        <div><span>Número visible</span><strong>{s.SOLI_NUMERO_DISP || "—"}</strong></div>
        <div><span>Tipo</span><strong className="typePill">{s.TIPO_SOLICITUD || "—"}</strong></div>
        <div><span>Fecha ingreso</span><strong>{formatDate(s.FECHA_INGRESO)}</strong></div>
        <div><span>Estado</span><Status>{s.ESTADO}</Status></div>
        <div><span>Resolución</span><strong>{s.SOLI_NRO_RESOLUCION || "—"}</strong></div>
      </div>
    </div>
    <div className="expedientePanel">
      <div className="expedienteTitle"><FolderOpen size={18}/><div><strong>Expediente relacionado</strong><span>Listado inicial de antecedentes encontrados en SAFF</span></div></div>
      <div className="expedienteGroups">
        {order.map(([key,label])=>{
          const rows=groups[key]||[];
          const count=rows.reduce((a,b)=>a+Number(b.cantidad||0),0);
          return <div className="expedienteGroup" key={key}>
            <div><strong>{label}</strong><span>{count} registro(s)</span></div>
            {rows.length ? <ul>{rows.slice(0,8).map(r=><li key={r.tabla}>{r.tabla} <b>{r.cantidad}</b></li>)}</ul> : <small>Sin registros relacionados detectados.</small>}
          </div>
        })}
      </div>
    </div>
  </div>;
}

function SolicitudCard({ item }) {
  const s = item.solicitud;
  return <section className="resultCard">
    <SolicitudFicha item={item}/>
    <div className="metricsGrid">
      <Metric icon={CalendarDays} label="Año" value={s.ANO_SOLICITUD}/><Metric icon={FileText} label="Tipo" value={s.TIPO_SOLICITUD}/>
      <Metric icon={Ruler} label="Sup. solicitada" value={`${formatNum(s.SOLI_SUP_SOLICITADA)} ha`}/><Metric icon={BadgeCheck} label="Sup. aprobada" value={`${formatNum(s.SOLI_SUP_APROBADA)} ha`}/>
    </div>
    {item.predios.map(p => <div className="predioResult" key={p.PRED_CODIGO}>
      <div className="predioHead"><div><h3>{p.PRED_NOMBRE || "Predio sin nombre"}</h3><div className="subtle">Código {p.PRED_CODIGO} · Rol {p.ROLES || "—"} · {p.LOCALIDAD || "Sin localidad"}</div></div><span className="sourceChip">SAFF + SIGCRA</span></div>
      <PredioVisual predio={p}/>
    </div>)}
    <h3>Propietario(s)</h3>
    <div className="stack">{item.propietarios.map(p => <div className="subcard" key={p.PERS_CODIGO}><strong>{p.NOMBRE_COMPLETO || "Sin nombre"}</strong><div className="subtle">RUT <Rut rut={p.PERS_RUT} dv={p.PERS_DV}/></div></div>)}</div>
  </section>;
}

function PredioCard({ item }) {
  const p = item.predio;
  return <section className="resultCard">
    <div className="cardTitleRow"><div><div className="eyebrow">Predio</div><h2>{p.PRED_NOMBRE || "Predio sin nombre"}</h2><div className="subtle">Código {p.PRED_CODIGO} · Rol {p.ROLES || "—"}</div></div><span className="sourceChip">SAFF + SIGCRA</span></div>
    <div className="metricsGrid"><Metric icon={Ruler} label="Superficie registrada" value={`${formatNum(p.PRED_SUPERFICIE)} ha`}/><Metric icon={MapPin} label="Localidad" value={p.LOCALIDAD || "—"}/><Metric icon={FileText} label="Solicitudes" value={item.solicitudes.length}/><Metric icon={UserRound} label="Propietarios" value={item.propietariosPredio.length}/></div>
    <PredioVisual predio={p}/>
    <h3>Historial de solicitudes</h3>
    <div className="tableWrap"><table><thead><tr><th>Año</th><th>Solicitud</th><th>Tipo</th><th>Estado</th><th>Propietario</th><th>Sup. solicitada</th><th>Sup. aprobada</th></tr></thead><tbody>{item.solicitudes.map((s,i)=><tr key={`${s.SOLI_NUMERO}-${i}`}><td>{s.ANO_SOLICITUD || "—"}</td><td><strong>{s.SOLI_NUMERO_DISP || s.SOLI_NUMERO}</strong></td><td>{s.TIPO_SOLICITUD || "—"}</td><td><Status>{s.ESTADO}</Status></td><td>{s.PROPIETARIOS || "—"}</td><td>{formatNum(s.SOLI_SUP_SOLICITADA)} ha</td><td>{formatNum(s.SOLI_SUP_APROBADA)} ha</td></tr>)}</tbody></table></div>
  </section>;
}

function PropietarioCard({ item }) {
  const p = item.propietario;
  return <section className="resultCard">
    <div className="cardTitleRow"><div><div className="eyebrow">Propietario</div><h2>{p.NOMBRE_COMPLETO || "Sin nombre"}</h2><div className="subtle">RUT <Rut rut={p.PERS_RUT} dv={p.PERS_DV}/></div></div></div>
    <div className="metricsGrid"><Metric icon={Trees} label="Predios registrados" value={item.predios.length}/><Metric icon={FileText} label="Solicitudes" value={item.solicitudes.length}/><Metric icon={MapPin} label="Localidades" value={new Set(item.predios.map(x=>x.LOCALIDAD).filter(Boolean)).size}/><Metric icon={Ruler} label="Superficie registrada" value={`${formatNum(item.predios.reduce((a,b)=>a+(Number(b.PRED_SUPERFICIE)||0),0))} ha`}/></div>
    <h3>Predios y geometría</h3>
    <div className="stack">{item.predios.map(pr => <div className="predioResult" key={pr.PRED_CODIGO}><div className="predioHead"><div><strong>{pr.PRED_NOMBRE || "Predio sin nombre"}</strong><div className="subtle">#{pr.PRED_CODIGO} · Rol {pr.ROLES || "—"} · {pr.LOCALIDAD || "—"}</div></div><span className="sourceChip">SAFF + SIGCRA</span></div><PredioVisual predio={pr}/></div>)}</div>
    <h3>Solicitudes</h3>
    <div className="tableWrap"><table><thead><tr><th>Año</th><th>Solicitud</th><th>Predio</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>{item.solicitudes.map((s,i)=><tr key={`${s.SOLI_NUMERO}-${s.PRED_CODIGO}-${i}`}><td>{s.ANO_SOLICITUD || "—"}</td><td><strong>{s.SOLI_NUMERO_DISP || s.SOLI_NUMERO}</strong></td><td>{s.PRED_NOMBRE || "—"}</td><td>{s.TIPO_SOLICITUD || "—"}</td><td><Status>{s.ESTADO}</Status></td></tr>)}</tbody></table></div>
  </section>;
}


function QualityMetric({ label, value, detail, icon: Icon }) {
  return <div className="qualityMetric">
    <div className="qualityMetricTop">
      <div className="qualityMetricIcon"><Icon size={18}/></div>
      <span>{label}</span>
    </div>
    <div className="qualityMetricValue">{value}</div>
    <div className="qualityMetricDetail">{detail}</div>
  </div>;
}

function CoverageRow({ label, count, percentage, tone }) {
  return <div className="coverageRow">
    <div className="coverageLabel">
      <span className={`coverageDot ${tone}`}></span>
      <strong>{label}</strong>
    </div>
    <div className="coverageTrack"><span className={`coverageFill ${tone}`} style={{width:`${percentage}%`}}></span></div>
    <div className="coverageNumbers"><strong>{formatNum(count, 0)}</strong><span>{percentage.toFixed(2)}%</span></div>
  </div>;
}

function QualityView() {
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    qualityData().then(setQuality).catch(err => setError(err.message));
  }, []);

  if (error) return <section className="error"><AlertCircle size={20}/><div><strong>No fue posible cargar la calidad</strong><span>{error}</span></div></section>;
  if (!quality) return <section className="empty"><Database size={25}/><strong>Cargando datos</strong></section>;

  if (quality.demo) {
    return <section className="qualityPage">
      <div className="qualityHeader">
        <div>
          <div className="eyebrow">GitHub Pages · datos de prueba</div>
          <h1>Candidatos geográficos publicados</h1>
          <p>La demo contiene exclusivamente casos cuya geometría puede renderizarse con los datos exportados. No se publican las DuckDB.</p>
        </div>
      </div>
      <div className="qualityMetrics">
        <QualityMetric icon={Database} label="Candidatos publicados" value={quality.candidateCount} detail="Dataset estático de demostración"/>
        <QualityMetric icon={MapPinned} label="Mapa de predio" value={quality.withPredioMap} detail="Geometría predial disponible"/>
        <QualityMetric icon={Layers3} label="Mapa de rodal" value={quality.withRodalMap} detail="Solo geometría validada"/>
        <QualityMetric icon={ShieldCheck} label="Predio + rodal" value={quality.withBoth} detail="Ambas geometrías disponibles"/>
      </div>
      <div className="qualityCard">
        <div className="qualityCardTitle"><ShieldCheck size={18}/><div><strong>Criterio de publicación</strong><span>{quality.meta?.filter}</span></div></div>
        <div className="qualityCallout"><strong>No se fabrican límites de rodales.</strong><span>{quality.meta?.note}</span></div>
      </div>
    </section>;
  }

  const c = quality.categorias;
  const f = quality.fuentes;
  return <section className="qualityPage">
    <div className="qualityHeader">
      <div><div className="eyebrow">Calidad y confianza de datos</div><h1>Cobertura geoespacial de solicitudes y predios</h1><p>Universo operacional PREDIOSOLICITUD contrastado entre ambas DuckDB.</p></div>
    </div>
    <div className="qualityMetrics">
      <QualityMetric icon={Database} label="Predios asociados" value={formatNum(quality.totalPredios,0)} detail="PREDIOSOLICITUD"/>
      <QualityMetric icon={MapPinned} label="Solicitudes geolocalizables" value={`${quality.solicitudes?.algunaGeolocalizable?.porcentaje?.toFixed(2) || "0.00"}%`} detail={`${formatNum(quality.solicitudes?.algunaGeolocalizable?.cantidad,0)} solicitudes`}/>
      <QualityMetric icon={AlertCircle} label="Predios sin coordenadas" value={`${c.ninguna.porcentaje.toFixed(2)}%`} detail={`${formatNum(c.ninguna.cantidad,0)} predios`}/>
      <QualityMetric icon={ShieldCheck} label="Todos sus predios GEO" value={`${quality.solicitudes?.todosPrediosGeolocalizables?.porcentaje?.toFixed(2) || "0.00"}%`} detail={`${formatNum(quality.solicitudes?.todosPrediosGeolocalizables?.cantidad,0)} solicitudes`}/>
    </div>
    <div className="qualityGrid">
      <div className="qualityCard">
        <div className="qualityCardTitle"><BarChart3 size={18}/><div><strong>Cobertura por combinación de fuentes</strong></div></div>
        <div className="coverageRows">
          <CoverageRow label="Ambas bases" count={c.ambas.cantidad} percentage={c.ambas.porcentaje} tone="both"/>
          <CoverageRow label="Solo mi_base" count={c.soloMiBase.cantidad} percentage={c.soloMiBase.porcentaje} tone="saff"/>
          <CoverageRow label="Solo SIGCRA" count={c.soloSigcra.cantidad} percentage={c.soloSigcra.porcentaje} tone="sigcra"/>
          <CoverageRow label="Ninguna" count={c.ninguna.cantidad} percentage={c.ninguna.porcentaje} tone="none"/>
        </div>
      </div>
      <div className="qualityCard">
        <div className="qualityCardTitle"><ShieldCheck size={18}/><div><strong>Fuentes</strong></div></div>
        <div className="sourceConfidence">
          <div className="sourceLine"><span>mi_base.duckdb</span><strong>{formatNum(f.miBase.cantidad,0)} · {f.miBase.porcentaje.toFixed(2)}%</strong></div>
          <div className="sourceLine"><span>sigcra.duckdb</span><strong>{formatNum(f.sigcra.cantidad,0)} · {f.sigcra.porcentaje.toFixed(2)}%</strong></div>
        </div>
      </div>
    </div>
  </section>;
}

function SearchExamples({ mode, onPick }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let active = true;
    examples(mode).then(x => { if (active) setItems(x); }).catch(() => setItems([]));
    return () => { active = false; };
  }, [mode]);

  if (!items.length) return DEMO_MODE && mode !== "predio"
    ? <div className="searchExamples"><span>Demo Pages:</span><em>sin datos de {mode}; ejecuta tools/exportar_demo_pages.py para publicarlos desde tus DuckDB.</em></div>
    : null;

  const getValue = x => mode === "solicitud"
    ? (x.SOLI_NUMERO_DISP || x.SOLI_NUMERO)
    : mode === "predio"
      ? x.PRED_CODIGO
      : (x.PERS_RUT ? `${x.PERS_RUT}${x.PERS_DV ? `-${x.PERS_DV}` : ""}` : x.NOMBRE_COMPLETO);

  const getLabel = x => mode === "solicitud"
    ? `${x.SOLI_NUMERO_DISP || x.SOLI_NUMERO} · ${x.TIPO_SOLICITUD || "Solicitud"}`
    : mode === "predio"
      ? `${x.PRED_NOMBRE || "Predio"} · ${x.PRED_CODIGO}`
      : `${x.NOMBRE_COMPLETO || "Propietario"}`;

  return <div className="searchExamples"><span>Ejemplos publicados:</span>{items.map((x,i)=><button type="button" key={i} onClick={()=>onPick(String(getValue(x)))}>{getLabel(x)}</button>)}</div>;
}

export default function App(){
  const [view,setView]=useState("consulta");
  const [mode,setMode]=useState("solicitud"), [query,setQuery]=useState(""), [data,setData]=useState(null), [loading,setLoading]=useState(false), [error,setError]=useState("");
  const current=useMemo(()=>modes.find(m=>m.id===mode),[mode]);

  async function search(e){
    e?.preventDefault();
    if(!query.trim())return;
    setLoading(true);setError("");setData(null);
    try{
      const j = await searchData(mode, query.trim());
      if (!j?.results?.length) throw new Error(
        DEMO_MODE
          ? "No hay coincidencias dentro del conjunto de prueba publicado en GitHub Pages."
          : "No se encontraron resultados."
      );
      setData(j)
    }catch(err){setError(err.message)}
    finally{setLoading(false)}
  }

  return <main>
    <header className="topbar">
      <div className="brand">
        <div className="brandMark"><Trees size={22}/></div>
        <div><strong>Consulta Predial</strong><span>{DEMO_MODE ? "Demo GitHub Pages · candidatos geográficos" : "SAFF + SIGCRA · Explorador integrado"}</span></div>
      </div>
      <nav className="mainNav">
        <button className={view==="consulta"?"navButton active":"navButton"} onClick={()=>setView("consulta")}><Search size={15}/>Consulta</button>
        <button className={view==="calidad"?"navButton active":"navButton"} onClick={()=>setView("calidad")}><ShieldCheck size={15}/>Calidad y confianza de datos</button>
      </nav>
      <div className="db"><Database size={15}/> {DEMO_MODE ? "Dataset estático" : "2 DuckDB locales"}</div>
    </header>

    <div className="page">
      {view==="calidad" ? <QualityView/> : <>
        <section className="hero">
          <div className="eyebrow">Búsqueda integrada</div>
          <h1>Solicitud, predio o propietario en una sola ficha territorial.</h1>
          <p>{DEMO_MODE ? "GitHub Pages publica solo candidatos con mapa disponible; las DuckDB permanecen fuera del repositorio." : "SAFF entrega la relación operacional; SIGCRA aporta la geometría georreferenciada."}</p>
          <div className="modeTabs">{modes.map(m=>{const Icon=m.icon;return <button key={m.id} className={mode===m.id?"mode active":"mode"} onClick={()=>{setMode(m.id);setData(null);setError("")}}><Icon size={17}/>{m.label}</button>})}</div>
          <form className="searchBox" onSubmit={search}><Search size={21}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={current.placeholder} autoFocus/><button disabled={loading}>{loading?"Buscando...":"Buscar"}<ChevronRight size={17}/></button></form>
          <SearchExamples mode={mode} onPick={(value)=>{setQuery(value);setData(null);setError("")}}/>
        </section>
        {!data&&!error&&!loading&&<section className="empty"><Search size={26}/><strong>Comienza con una búsqueda</strong><span>{DEMO_MODE ? "Prueba el predio de ejemplo georreferenciable publicado debajo del buscador." : "El resultado incluirá antecedentes SAFF y geometría SIGCRA cuando esté disponible."}</span></section>}
        {error&&<section className="error"><AlertCircle size={20}/><div><strong>No encontramos resultados</strong><span>{error}</span></div></section>}
        {data?.results?.length>0&&<section className="results"><div className="resultCount">{data.results.length} resultado(s)</div>{mode==="solicitud"&&data.results.map((x,i)=><SolicitudCard item={x} key={i}/>)}{mode==="predio"&&data.results.map((x,i)=><PredioCard item={x} key={i}/>)}{mode==="propietario"&&data.results.map((x,i)=><PropietarioCard item={x} key={i}/>)}</section>}
      </>}
    </div>
  </main>;
}
