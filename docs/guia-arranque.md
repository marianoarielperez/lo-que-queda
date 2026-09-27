# Guía de arranque — lunes 21/9, desde cero

Para Aldana y Mariano. Orden de la mañana, con tiempos estimados. El proyecto está en el pen, en
la carpeta `lo-que-queda` (la copia buena, con los datos ya procesados).

Antes de empezar, dos cosas a confirmar:
- **¿La PC de Aldana permite instalar programas?** Si pide contraseña de administrador y no la
  tienen, hay que pedirla a sistemas antes; sin eso no se puede instalar Node ni GitHub Desktop.
- **¿Con qué cuenta se usa Claude Code?** Claude Code corre en la terminal y se conecta con una
  cuenta de Claude (Pro o Max) o con una clave de API. Lo natural es que Claude Code lo use Mariano
  con su cuenta; Aldana no lo necesita para su parte. Si Aldana también lo va a usar, hay que
  decidir con qué cuenta entra.

---

## Bloque 1 · Instalar lo básico en la PC de Aldana (30–45 min)

Todo gratis. Instalar en este orden, aceptando las opciones por defecto salvo donde se indica.

1. **Node.js** (hace funcionar la web en la compu): https://nodejs.org → botón "LTS". Al terminar,
   abrir una terminal (tecla Windows → escribir `cmd` → Enter) y comprobar:
   ```
   node -v
   npm -v
   ```
   Tienen que aparecer dos números de versión (por ejemplo `v22.x` y `10.x`).

2. **GitHub Desktop** (para subir el proyecto a GitHub sin usar comandos): https://desktop.github.com.
   Al abrirlo pide iniciar sesión: crear la cuenta según lo decidido en `docs/git-github.md`
   (recomendado: cuenta nueva con el nombre del seudónimo o del proyecto, porque el repositorio va
   a ser público).

3. **Visual Studio Code** (editor de texto; opcional pero cómodo para tocar textos y ver el código):
   https://code.visualstudio.com. Instalar con la opción "Agregar 'Abrir con Code' al menú contextual".

4. Python ya está. Solo si Aldana va a correr el pipeline de datos (no hace falta para su parte):
   `pip install pandas numpy geopandas shapely pyogrio`.

## Bloque 2 · Copiar el proyecto y verlo andar (15 min)

1. Copiar la carpeta `lo-que-queda` del pen a `C:\Users\<usuario>\Documents\lo-que-queda`
   (no dejarla en el pen ni en el escritorio de red).
2. Abrir una terminal **dentro de esa carpeta**: en el Explorador, entrar a la carpeta, hacer clic en
   la barra de direcciones, escribir `cmd` y Enter.
3. Instalar las dependencias de la web (una sola vez, tarda 1–2 minutos):
   ```
   npm install
   ```
4. Levantar la web:
   ```
   npm run dev
   ```
   Aparece una dirección tipo `http://localhost:5173/`. Abrirla en el navegador. Tiene que verse la
   portada con los puntos del país, y al hacer scroll el recorrido de siete pasos y al final el panel
   de filtros. Si el mapa de fondo tarda o no aparece, no importa: los pozos y los límites son
   nuestros; el fondo cartográfico viene de internet.
5. Para cerrar: en la terminal, `Ctrl + C`.

Si `npm install` falla por el proxy de la oficina (error con "ECONNRESET" o "407"), avisarle a
sistemas que la PC necesita salida a `registry.npmjs.org`, o hacer este paso desde una red sin proxy
(un celular compartiendo internet alcanza; son unos 150 MB).

## Bloque 3 · Subir a GitHub y publicar (40 min)

Seguir `docs/git-github.md` al pie de la letra, secciones 2, 3 y 4:
- crear el repositorio desde GitHub Desktop con la carpeta `lo-que-queda` (público);
- Settings → Pages → Source: **GitHub Actions**;
- esperar que la pestaña Actions quede en verde y abrir el link `https://<cuenta>.github.io/lo-que-queda/`;
- agregar a Mariano como colaborador.

Dato: el repositorio va a pesar unos 90 MB por los datos crudos (incluido el mensual comprimido de
41 MB). La primera subida puede tardar unos minutos. Si GitHub rechaza algún archivo por tamaño,
mandar la captura al chat.

Cuando el link abra desde el celular de cualquiera de los dos, el bloque está terminado.

## Bloque 4 · Claude Code (Mariano, 20 min)

Claude Code es el asistente en la terminal que va a ir haciendo las tareas del plan. Se instala con
Node, que ya quedó del bloque 1 (si Mariano trabaja desde su propia PC, instalar Node ahí igual).

1. En una terminal:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
2. Entrar a la carpeta del proyecto (la copia local, que ya es un repositorio) y ejecutar:
   ```
   claude
   ```
   La primera vez pide iniciar sesión con la cuenta de Claude (abre el navegador). Al abrir en esta
   carpeta lee solo `CLAUDE.md`, donde están las reglas del proyecto.
3. Forma de pedir trabajo, siempre por número de tarea del plan:
   ```
   Leé docs/plans/2026-09-18-plan-implementacion.md y hacé la tarea 2.8.
   ```
   Al terminar cada tarea: comprobar en el navegador (`npm run dev`), y en GitHub Desktop hacer
   Commit + Push. Uno o dos minutos después el link público muestra el cambio.

Tareas para arrancar esta semana, en orden (todas en el plan):
- **2.8** etiquetas del gráfico del paso 1 y coma decimal en los porcentajes;
- **2.3** atenuar pozos fuera del ejido cuando se enciende la población; leyenda de población;
- **2.5** tooltip al pasar por un pozo;
- **2.10** resaltar los 2.207 pozos en áreas sin concesión vigente en el paso 3;
- **2.9b** filtro "tiempo sin producir" en el panel;
- **2.4** aplicar el diseño de Aldana (cuando esté el boceto);
- **2.6** móvil.

## Bloque 5 · Aldana, en paralelo (resto del día)

Con la web publicada, arranca lo suyo, según `docs/para-aldana.md`:
1. Abrir el formulario del concurso y anotar qué acepta el campo "Institución" para presentación
   personal y cómo se carga un equipo de dos. Elegir seudónimo y nombre definitivo.
2. Boceto de tarjeta, leyenda y portada (en lo que use). Foto o captura al chat.
3. Leer las siete tarjetas en la web publicada y reescribirlas con su voz. Puede hacerlo en un
   documento aparte con el número de paso; después se pasan a `src/story.js`. Regla única: las
   cifras no se tipean, vienen de los datos.

## Si algo se traba

- `node` o `npm` "no se reconoce como comando": cerrar y volver a abrir la terminal después de instalar Node.
- `npm run dev` abre pero la página está en blanco: F12 → pestaña Console → captura al chat.
- Actions en rojo en GitHub: abrir el flujo, captura del error al chat.
- Claude Code no arranca o pide clave: revisar con qué cuenta se inició sesión; si no hay
  suscripción activa, decidir cuenta antes de seguir.
- Cualquier otra cosa: pegar el texto completo del error en el chat. Casi siempre se resuelve en dos mensajes.

## Al final del día, lo que tendría que haber

- El link público de la web abriendo en cualquier compu y celular.
- Mariano y Aldana como colaboradores del repo, y un primer commit de cada uno.
- Claude Code funcionando en la carpeta de Mariano, con la tarea 2.8 hecha y subida.
- Las notas del formulario, el seudónimo y el nombre de la pieza en `docs/formulario.md`.
- El boceto de Aldana en el chat.
