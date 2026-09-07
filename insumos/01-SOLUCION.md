# Que se construyo

## Que hace el sistema

Permite buscar un predio y ver de una sola vez lo que hay asociado a el: la
ficha del predio, quien figura como propietario y que solicitudes lo tocan.
La interfaz esta construida como un conjunto de fichas, una por entidad
[frontend/src/App.jsx], sobre un modelo de datos que relaciona solicitud,
predio, propietario y persona [backend/VALIDAR_RELACIONES.sql:62] a
[backend/VALIDAR_RELACIONES.sql:66].

Permite ademas ver el predio dibujado, cuando hay geometria con que dibujarlo
[frontend/src/App.jsx], y mirar el estado de la propia informacion: que
proporcion de los registros esta completa y que queda fuera
[frontend/src/api.js:155].

## Capacidades, una por una

**Consultar un predio y su entorno.** La interfaz define fichas separadas
para predio, propietario y solicitud, mas una vista de detalle de solicitud
[frontend/src/App.jsx]. El modelo que las sostiene relaciona seis entidades
[backend/VALIDAR_RELACIONES.sql:8], [backend/VALIDAR_RELACIONES.sql:9],
[backend/VALIDAR_RELACIONES.sql:10], [backend/VALIDAR_RELACIONES.sql:17],
[backend/VALIDAR_RELACIONES.sql:19] y
[backend/VALIDAR_RELACIONES.sql:48].

**Sugerir por donde empezar.** Hay un endpoint de ejemplos
[frontend/src/api.js:87] y una vista que los presenta
[frontend/src/App.jsx].

**Mostrar la calidad del dato.** Hay un endpoint dedicado
[frontend/src/api.js:155] y una vista entera para el, con metricas y filas de
cobertura [frontend/src/App.jsx]. [INFERIDO] El sistema no solo entrega el
dato: tambien declara cuanto del dato falta. Es una capacidad poco comun y
conviene no perderla en una reescritura.

**Dibujar el predio.** Hay un mapa de predio y un ajuste automatico del
encuadre a la geometria disponible [frontend/src/App.jsx], apoyados en una
biblioteca de mapas [frontend/package.json:17] y su envoltorio
[frontend/package.json:18]. Hay ademas un resumen de subdivision y una vista
visual del predio [frontend/src/App.jsx].

**Funcionar sin servidor.** El cliente tiene un modo de demostracion,
DEMO_MODE [frontend/src/api.js], que en lugar de llamar a la API lee un
archivo estatico [frontend/src/api.js:9], publicado junto al codigo
[frontend/public/demo-data.json]. Ese archivo lo produce un script
[tools/exportar_demo_pages.py]. El README explica por que existe ese modo: el
servicio donde se publica no ejecuta ni el servidor ni el motor de datos
[README.md].

**Levantar el entorno local.** Hay dos scripts de arranque, uno por parte
[iniciar_backend.bat], [iniciar_frontend.bat], y dos plantillas de
configuracion [backend/.env.example], [frontend/.env.example].

## Roles: quien ve que

No hay roles. El analizador no detecto ningun guard, ningun decorador de
autorizacion, ninguna tabla de permisos, ningun inicio de sesion ni ninguna
nocion de usuario en las veinticinco rutas del repositorio. Las cinco
variables de entorno detectadas son de puerto, de rutas a bases y de
direccion de la API [backend/server.js:9], [backend/server.js:10],
[backend/server.js:11], [frontend/src/api.js:1],
[frontend/src/api.js:8]; ninguna es de credencial.

[INFERIDO] Quien pueda abrir la direccion ve todo lo que el servidor
devuelva, incluida la ficha de propietario y de persona
[backend/VALIDAR_RELACIONES.sql:17],
[backend/VALIDAR_RELACIONES.sql:19]. [VERIFICAR] Si eso es aceptable, y bajo
que condicion, lo tiene que resolver Fiscalia.

[PENDIENTE] Quien debe poder consultar y quien no.

## De donde salen los datos

[INFERIDO] La fuente son dos bases distintas, montadas como archivos y no
como servicio: el servidor toma sus rutas de dos variables de entorno
separadas [backend/server.js:10], [backend/server.js:11]. Los nombres de esas
variables apuntan a dos sistemas de origen distintos, y esa separacion es la
razon de ser del cruce.

[INFERIDO] El acceso se hace con un motor analitico embebido
[backend/package.json:10], no con un servidor de base de datos.

[INFERIDO] El conjunto publicado es un extracto, no la fuente: lo genera un
script [tools/exportar_demo_pages.py] que usa el mismo motor
[tools/requirements.txt:1] y una biblioteca de tablas
[tools/requirements.txt:2], y escribe un archivo estatico
[frontend/public/demo-data.json]. El README acota el criterio de seleccion:
solo los casos que podian representarse sin inventar coordenadas
[README.md].

[PENDIENTE] Quien es dueno de cada una de las dos bases de origen, quien las
actualiza y con que periodicidad. El codigo dice como se leen, no de quien
son.

[PENDIENTE] Que informe previo alimento la construccion. El README lo nombra
[README.md] pero no esta en el repositorio.

## Que NO hace

Solo ausencias que el analizador busco de forma exhaustiva.

[INFERIDO] No existe ninguna ruta cuyo path contenga export, descarga o
informe. Las tres llamadas de red detectadas en todo el frontend son al
archivo estatico [frontend/src/api.js:9], a los ejemplos
[frontend/src/api.js:87] y a la calidad de datos
[frontend/src/api.js:155]. La palabra exportar aparece en el codigo, pero
como palabra clave del lenguaje [frontend/src/api.js:1] y en el nombre de un
script de linea de comandos [tools/exportar_demo_pages.py]; ninguna de las
dos cosas es una funcionalidad de exportacion para el usuario.

[INFERIDO] No existe ninguna operacion de escritura detectada: las tres
llamadas son de lectura. [PENDIENTE] Confirmar que el sistema es solo de
consulta; el analizador no enumero las rutas del servidor
[backend/server.js], asi que esta ausencia es menos solida que las demas.

[INFERIDO] No hay definicion de esquema propia: el unico archivo SQL del
repositorio es de validacion de relaciones
[backend/VALIDAR_RELACIONES.sql:8], no de creacion. El sistema consulta bases
que ya existen; no las crea.

[INFERIDO] No hay ninguna prueba automatizada: el analizador no encontro
ningun archivo de prueba ni ninguna dependencia de pruebas en los tres
manifiestos [backend/package.json], [frontend/package.json],
[tools/requirements.txt].

## Iteraciones

[INFERIDO] Hay al menos cinco iteraciones previas implicitas en el numero de
version que el README declara [README.md]. No hay CHANGELOG, ni tags
detectados, ni migraciones numeradas. [PENDIENTE] Que cambio en cada una.

[INFERIDO] La publicacion esta automatizada [.github/workflows/deploy-pages.yml],
y hay un documento dedicado a explicarla [GITHUB_PAGES.md].

## Nota sobre la calidad de esta reconstruccion

La evidencia de este repositorio es media: el modelo de datos y el frontend
estan bien cubiertos, pero el servidor es un unico archivo cuyas rutas el
analizador no enumero [backend/server.js]. Todo lo que este documento dice
del servidor sale de las llamadas que el cliente le hace, no de sus propias
definiciones. Es el punto ciego que hay que cerrar leyendo ese archivo.
