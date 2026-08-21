"""
Genera frontend/public/demo-data.json desde mi_base.duckdb + sigcra.duckdb.

Criterio:
- Solo predios presentes en PREDIOSOLICITUD.
- Deben tener >= 3 coordenadas lat/lon válidas en SIGCRA.
- Rodales se publican como atributos.
- No se crea geometría de rodal sin relación cartográfica validada.
- Solicitudes y propietarios publicados quedan restringidos a esos predios.

Uso:
    python tools/exportar_demo_pages.py "C:\ruta\mi_base.duckdb" "C:\ruta\sigcra.duckdb" --limit 10
"""
from pathlib import Path
import argparse, json, math
import duckdb

parser = argparse.ArgumentParser()
parser.add_argument("saff")
parser.add_argument("sigcra")
parser.add_argument("--limit", type=int, default=10)
args = parser.parse_args()

saff = duckdb.connect(args.saff, read_only=True)
sig = duckdb.connect(args.sigcra, read_only=True)

cands = saff.execute("""
SELECT
  ps.PRED_CODIGO,
  p.PRED_NOMBRE,
  p.PRED_SUPERFICIE,
  l.LOCA_DESCRIPCION AS LOCALIDAD,
  COUNT(DISTINCT r.RODA_CODIGO) AS RODALES
FROM PREDIOSOLICITUD ps
JOIN PREDIO p ON p.PRED_CODIGO=ps.PRED_CODIGO
LEFT JOIN LOCALIDAD l ON l.LOCA_CODIGO=p.LOCA_CODIGO
LEFT JOIN RODAL r ON r.PRED_CODIGO=p.PRED_CODIGO
GROUP BY ps.PRED_CODIGO,p.PRED_NOMBRE,p.PRED_SUPERFICIE,l.LOCA_DESCRIPCION
HAVING COUNT(DISTINCT r.RODA_CODIGO) > 0
ORDER BY RODALES DESC
""").fetchdf()

predios=[]
for _, c in cands.iterrows():
    code=str(int(c.PRED_CODIGO))
    pts=sig.execute("""
      SELECT longitud,latitud,este,norte,coor_orden,coor_punto_referencia
      FROM conaf_coordenada_data_distancia
      WHERE TRIM(pred_codigo)=?
        AND TRY_CAST(longitud AS DOUBLE) IS NOT NULL
        AND TRY_CAST(latitud AS DOUBLE) IS NOT NULL
        AND NOT COALESCE(errorfomato,false)
        AND NOT COALESCE(datuminvaildo,false)
    """,[code]).fetchdf()
    if len(pts.drop_duplicates(subset=["longitud","latitud"])) < 3:
        continue

    # Simple stable angular ordering for static demo.
    pts=pts.drop_duplicates(subset=["longitud","latitud"]).copy()
    cx=pts["longitud"].astype(float).mean()
    cy=pts["latitud"].astype(float).mean()
    pts["angle"]=[math.atan2(float(y)-cy,float(x)-cx) for x,y in zip(pts.longitud,pts.latitud)]
    pts=pts.sort_values("angle")
    ring=[[float(x),float(y)] for x,y in zip(pts.longitud,pts.latitud)]
    ring.append(ring[0])

    rods=saff.execute("""
      SELECT RODA_CODIGO,RODA_NUMERO,RODA_SUPERFICIE,RODA_ANO_PLANTACION,SECT_CODIGO,RODA_VIGENTE
      FROM RODAL WHERE PRED_CODIGO=? ORDER BY RODA_VIGENTE DESC,RODA_NUMERO
    """,[int(code)]).fetchdf().where(lambda x: x.notna(), None).to_dict("records")

    predios.append({
      "PRED_CODIGO":int(code),
      "PRED_NOMBRE":c.PRED_NOMBRE,
      "PRED_SUPERFICIE":None if c.PRED_SUPERFICIE is None else float(c.PRED_SUPERFICIE),
      "LOCALIDAD":c.LOCALIDAD,
      "ROLES":None,
      "geo":{"available":True,"source":"SIGCRA","pointCount":len(pts),"center":[cy,cx],
             "features":[{"type":"Feature","properties":{"role":"predio","label":"Perímetro SIGCRA","crossings":0},
                          "geometry":{"type":"Polygon","coordinates":[ring]}}]},
      "subdivisiones":{"sectores":[],"rodales":rods,"areas":[]},
      "rodalGeo":{"available":False,"source":None,"reason":"Sin relación geográfica de rodal validada","features":[]}
    })
    if len(predios) >= args.limit:
        break

codes=[p["PRED_CODIGO"] for p in predios]
if codes:
    marks=",".join(["?"]*len(codes))
    solicitudes=saff.execute(f"""
      SELECT DISTINCT ps.PRED_CODIGO,s.SOLI_NUMERO,s.SOLI_NUMERO_DISP,s.SOLI_FECHA_INGRESO,
        EXTRACT(YEAR FROM s.SOLI_FECHA_INGRESO)::INTEGER AS ANO_SOLICITUD,
        ts.TISO_DESCRIPCION AS TIPO_SOLICITUD,e.ESTA_DESCRIPCION AS ESTADO,
        s.SOLI_SUP_SOLICITADA,s.SOLI_SUP_APROBADA
      FROM PREDIOSOLICITUD ps
      JOIN SOLICITUD s ON s.SOLI_NUMERO=ps.SOLI_NUMERO
      LEFT JOIN TIPOSOLICITUD ts ON ts.TISO_CODIGO=s.TISO_CODIGO
      LEFT JOIN ESTADO e ON e.ESTA_CODIGO=s.ESTA_CODIGO
      WHERE ps.PRED_CODIGO IN ({marks})
    """, codes).fetchdf().where(lambda x:x.notna(),None).to_dict("records")

    propietarios=saff.execute(f"""
      SELECT DISTINCT pp.PRED_CODIGO,pe.PERS_CODIGO,pe.PERS_RUT,pe.PERS_DV,
        TRIM(CONCAT_WS(' ',NULLIF(pe.PERS_NOMBRE,''),NULLIF(pe.PERS_PATERNO,''),NULLIF(pe.PERS_MATERNO,''))) AS NOMBRE_COMPLETO
      FROM PROPIETARIOPREDIO pp JOIN PERSONA pe ON pe.PERS_CODIGO=pp.PERS_CODIGO
      WHERE pp.PRED_CODIGO IN ({marks})
    """, codes).fetchdf().where(lambda x:x.notna(),None).to_dict("records")
else:
    solicitudes=[]
    propietarios=[]

data={
 "meta":{"version":"0.5.0","filter":"Solo candidatos con >=3 puntos SIGCRA y rodales SAFF."},
 "predios":predios,
 "solicitudes":solicitudes,
 "propietarios":propietarios,
 "quality":{"candidateCount":len(predios),"withPredioMap":len(predios),"withRodalMap":0,"withBoth":0}
}
out=Path(__file__).resolve().parents[1]/"frontend"/"public"/"demo-data.json"
out.write_text(json.dumps(data,ensure_ascii=False,indent=2,default=str),encoding="utf-8")
print("Generado:",out)
print("Predios:",len(predios),"Solicitudes:",len(solicitudes),"Propietarios:",len(propietarios))
