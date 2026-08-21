-- Ejecutar en DuckDB antes de cerrar el modelo definitivo.

-- 1) ¿Toda relación solicitud-predio apunta a registros existentes?
SELECT
  COUNT(*) AS relaciones,
  COUNT(*) FILTER (WHERE s.SOLI_NUMERO IS NULL) AS sin_solicitud,
  COUNT(*) FILTER (WHERE p.PRED_CODIGO IS NULL) AS sin_predio
FROM PREDIOSOLICITUD ps
LEFT JOIN SOLICITUD s ON s.SOLI_NUMERO = ps.SOLI_NUMERO
LEFT JOIN PREDIO p ON p.PRED_CODIGO = ps.PRED_CODIGO;

-- 2) ¿PROPIETARIO realmente representa propietario de cada solicitud?
SELECT
  COUNT(*) AS relaciones,
  COUNT(*) FILTER (WHERE s.SOLI_NUMERO IS NULL) AS sin_solicitud,
  COUNT(*) FILTER (WHERE pe.PERS_CODIGO IS NULL) AS sin_persona
FROM PROPIETARIO pr
LEFT JOIN SOLICITUD s ON s.SOLI_NUMERO = pr.SOLI_NUMERO
LEFT JOIN PERSONA pe ON pe.PERS_CODIGO = pr.PERS_CODIGO;

-- 3) Número de predios por solicitud
SELECT
  COUNT(*) AS solicitudes_con_predio,
  AVG(cantidad_predios) AS promedio_predios,
  MAX(cantidad_predios) AS max_predios
FROM (
  SELECT SOLI_NUMERO, COUNT(DISTINCT PRED_CODIGO) AS cantidad_predios
  FROM PREDIOSOLICITUD
  GROUP BY SOLI_NUMERO
);

-- 4) Número de propietarios por solicitud
SELECT
  COUNT(*) AS solicitudes_con_propietario,
  AVG(cantidad_propietarios) AS promedio_propietarios,
  MAX(cantidad_propietarios) AS max_propietarios
FROM (
  SELECT SOLI_NUMERO, COUNT(DISTINCT PERS_CODIGO) AS cantidad_propietarios
  FROM PROPIETARIO
  GROUP BY SOLI_NUMERO
);

-- 5) Propiedad predial histórica / actual
SELECT
  COUNT(*) AS relaciones,
  COUNT(DISTINCT PERS_CODIGO) AS personas,
  COUNT(DISTINCT PRED_CODIGO) AS predios
FROM PROPIETARIOPREDIO;

-- 6) Ejemplo completo de 20 solicitudes recientes válidas
SELECT
  s.SOLI_NUMERO,
  s.SOLI_NUMERO_DISP,
  s.SOLI_FECHA_INGRESO,
  p.PRED_CODIGO,
  p.PRED_NOMBRE,
  pe.PERS_CODIGO,
  pe.PERS_RUT,
  pe.PERS_NOMBRE,
  pe.PERS_PATERNO,
  pe.PERS_MATERNO
FROM SOLICITUD s
LEFT JOIN PREDIOSOLICITUD ps ON ps.SOLI_NUMERO = s.SOLI_NUMERO
LEFT JOIN PREDIO p ON p.PRED_CODIGO = ps.PRED_CODIGO
LEFT JOIN PROPIETARIO pr ON pr.SOLI_NUMERO = s.SOLI_NUMERO
LEFT JOIN PERSONA pe ON pe.PERS_CODIGO = pr.PERS_CODIGO
WHERE s.SOLI_FECHA_INGRESO BETWEEN DATE '2020-01-01' AND CURRENT_DATE
ORDER BY s.SOLI_FECHA_INGRESO DESC
LIMIT 20;