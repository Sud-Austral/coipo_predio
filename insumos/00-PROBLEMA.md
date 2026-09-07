# Que estaba roto, deducido de lo que se construyo

Este documento se lee hacia atras: desde lo construido hacia el problema que
lo habria originado. La cadena es debil y va marcada como tal.

## De que trata el sistema

El repositorio trae una consulta de validacion sobre seis entidades:
solicitud [backend/VALIDAR_RELACIONES.sql:9], predio
[backend/VALIDAR_RELACIONES.sql:10], la relacion entre ambos
[backend/VALIDAR_RELACIONES.sql:8], propietario
[backend/VALIDAR_RELACIONES.sql:17], persona
[backend/VALIDAR_RELACIONES.sql:19] y la relacion entre propietario y predio
[backend/VALIDAR_RELACIONES.sql:48]. La aplicacion muestra fichas de esas
mismas entidades [frontend/src/App.jsx].

[INFERIDO] El sistema permite buscar un predio y ver quien lo tiene asociado
y que solicitudes carga, luego probablemente habia un problema con encontrar
esa informacion junta, dispersa entre registros que no se cruzaban solos.

[INFERIDO] Y habia un problema anterior a ese: el de la calidad del cruce. El
archivo que valida relaciones se llama asi
[backend/VALIDAR_RELACIONES.sql:8], hay un endpoint dedicado a la calidad de
los datos [frontend/src/api.js:155] y una vista completa para mostrarla
[frontend/src/App.jsx]. Que se construya una pantalla entera para exhibir los
huecos del dato sugiere que los huecos eran el problema, no un efecto
secundario. [PENDIENTE] Quien detecto esos huecos y como se enteraron.

[INFERIDO] La parte cartografica estaba especialmente rota. El README
declara, para el conjunto que se pudo publicar, que la capa de rodales quedo
preparada pero sin poligono porque no existia una relacion cartografica
validada, y que de veinte candidatos con conteos suficientes de coordenadas,
en diecinueve el archivo de origen no traia los vertices completos
[README.md]. Es la descripcion mas concreta del problema que hay en todo el
repositorio, y esta escrita por quien construyo el sistema, no por el area
usuaria. [PENDIENTE] Confirmarla con quien produce ese archivo de origen.

## Quien sufre el problema

[PENDIENTE]. El analizador no encontro ningun guard, ningun decorador de
autorizacion, ninguna tabla de permisos ni ningun inicio de sesion en las
veinticinco rutas del repositorio. No hay roles que nombrar con cita.

[INFERIDO] Hay una nocion de ejemplos de busqueda expuesta por el servidor
[frontend/src/api.js:87] y una pantalla que los ofrece
[frontend/src/App.jsx]. Ofrecer ejemplos sugiere que quien consulta no sabe
de antemano que escribir. [PENDIENTE] Quien consulta y con que pregunta
llega.

[PENDIENTE] Cuantas personas usan esto y desde que unidad.

## Como lo resolvian antes

[INFERIDO] La informacion venia de al menos dos sistemas distintos, y
juntarlos era el trabajo: el servidor toma la ruta de dos bases separadas por
variables de entorno distintas [backend/server.js:10] y
[backend/server.js:11].

[INFERIDO] Al menos una parte llegaba como archivo de texto plano y no como
base consultable: el README describe que el archivo de origen no traia los
vertices completos [README.md].

[INFERIDO] Hubo un informe previo que sirvio de insumo y que no esta en el
repositorio: el README lo nombra como la fuente de lo que se pudo publicar
[README.md]. [PENDIENTE] Quien produjo ese informe, cuando y con que alcance.

[PENDIENTE] Quien hacia el cruce antes, con que herramienta y cuanto tardaba.

## Que pasa si no se hace nada

[PENDIENTE], sin excepcion. El codigo no lo responde.

## Volumen

Los indicios dan orden de magnitud y nada mas.

[INFERIDO] El volumen justificaba un motor analitico embebido y no una
consulta directa: el servidor usa uno [backend/package.json:10] y el script
de exportacion usa el mismo [tools/requirements.txt:1]. Eso indica que el
conjunto no cabia comodamente en memoria del navegador, no cuantas filas
tiene.

[INFERIDO] El conjunto publicado es minusculo comparado con la fuente: el
archivo estatico ronda los veinte kilobytes
[frontend/public/demo-data.json] y el README explica que solo contiene los
casos que podian dibujarse sin inventar coordenadas [README.md].

[PENDIENTE] Cuantos predios, cuantas solicitudes y cuantos propietarios tiene
la fuente real. Ningun numero del codigo lo responde, y las cifras que
aparecen en el README describen un caso de demostracion, no el universo.

## Quien decide que esta terminado

[PENDIENTE], sin excepcion. El numero de version que el README declara
[README.md] es una etiqueta puesta por quien construyo, no una aceptacion.

## Nota sobre datos personales

[VERIFICAR] Este repositorio es publico y contiene un conjunto de datos
versionado [frontend/public/demo-data.json] derivado de registros reales
segun el propio README [README.md]. El modelo que lo produce incluye una
entidad persona [backend/VALIDAR_RELACIONES.sql:19] y una de propietario
[backend/VALIDAR_RELACIONES.sql:17], y la interfaz tiene un componente
dedicado a presentar identificadores de persona [frontend/src/App.jsx]. Antes
de cualquier otra decision, Fiscalia tiene que revisar si ese archivo puede
estar publicado.
