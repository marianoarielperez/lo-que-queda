# Git y GitHub — guía paso a paso

Para Aldana, que crea el repositorio. No hace falta saber Git: se hace todo desde la aplicación
GitHub Desktop, con botones. Tiempo: 30–40 minutos la primera vez.

## Una decisión antes de empezar: cuenta y visibilidad

GitHub Pages (el servicio que publica la web gratis) **solo funciona con repositorios públicos** en
las cuentas gratuitas. Un repositorio público muestra el nombre de usuario de la cuenta. Como el
trabajo se presenta con seudónimo hasta el fallo, hay dos caminos:

- **Recomendado:** crear una cuenta nueva de GitHub con el nombre del seudónimo (o del proyecto) y
  hacer el repositorio ahí, público. Mariano se agrega como colaborador. Después del fallo se puede
  transferir a tu cuenta personal.
- Alternativa: usar tu cuenta personal; tu usuario queda visible en el link (`usuario.github.io/...`).

Con la cuenta decidida, seguí.

## 1. Instalar lo necesario (una vez)

1. **GitHub Desktop:** https://desktop.github.com — instalar, abrir, iniciar sesión con la cuenta.
2. **Node.js** (para que la web compile en tu compu, opcional pero útil): https://nodejs.org, versión LTS.

## 2. Crear el repositorio y subir el proyecto

1. Descomprimir `lo-que-queda.zip` en una carpeta, por ejemplo `Documentos\lo-que-queda`.
2. En GitHub Desktop: **File → Add local repository** → elegir esa carpeta. Va a decir que no es un
   repositorio todavía y ofrecer **"create a repository here"**: aceptar.
   - Name: `lo-que-queda`
   - Description: "Lo que queda — pozos del Golfo San Jorge. Contar con Datos 2026."
   - Dejá tildado "Initialize with a README" **desactivado** (ya hay README) y Git ignore en "None"
     (ya hay `.gitignore`).
3. Abajo a la izquierda vas a ver todos los archivos listados como cambios. En "Summary" escribí
   `Proyecto inicial` y apretá **Commit to main**.
4. Arriba, botón **Publish repository**. Destildá "Keep this code private" (tiene que ser público
   para Pages). Publicar.
5. Entrá al repositorio en github.com y verificá que se vean las carpetas `src`, `public`, `docs`.

Nota: la carpeta `data-pipeline/raw/` pesa unos 47 MB y sí va al repositorio (es la garantía de que
los datos se pueden reproducir). El primer "Publish" puede tardar unos minutos.

## 3. Activar GitHub Pages

1. En github.com, dentro del repositorio: **Settings → Pages** (menú de la izquierda).
2. En "Build and deployment", **Source: GitHub Actions** (no "Deploy from a branch").
3. Ir a la pestaña **Actions** del repositorio. Debería aparecer un flujo llamado "Publicar en
   GitHub Pages" corriendo o ya terminado (lo dispara el archivo `.github/workflows/deploy.yml`). Si
   está en rojo, abrirlo y mandar la captura del error al chat.
4. Cuando termine en verde, el link de la web aparece en Settings → Pages:
   `https://<cuenta>.github.io/lo-que-queda/`. Abrirlo. Tiene que verse la portada y el mapa.

Si el flujo no arrancó solo: Actions → "Publicar en GitHub Pages" → **Run workflow**.

## 4. Agregar a Mariano como colaborador

Settings → **Collaborators** → Add people → su usuario de GitHub → Write. Él acepta la invitación
por mail. Con eso él puede subir cambios directo.

## 5. El día a día

Cada vez que alguien cambia algo (un texto, un color, código):

1. En GitHub Desktop aparece el cambio listado.
2. Escribir en "Summary" qué se cambió, en pocas palabras (`Textos del paso 4`, `Ajuste de leyenda`).
3. **Commit to main** → **Push origin**.
4. Uno o dos minutos después, el link de Pages muestra la nueva versión (Actions en verde).

Antes de tocar algo, apretar **Fetch origin** para traer lo último que subió el otro. Si los dos
cambian el mismo archivo al mismo tiempo, GitHub Desktop avisa un "conflicto": no toques nada y
mandá la captura al chat, se resuelve en dos minutos.

## 6. Trabajar con Claude Code (Mariano)

Claude Code lee `CLAUDE.md` al abrir la carpeta y ahí tiene las reglas del proyecto. Forma de pedir:

```
Hacé la tarea 2.3 del plan (docs/plans/2026-09-18-plan-implementacion.md).
```

Después de cada tarea: `npm run build` sin errores, mirar en el navegador, commit y push.

## 7. Congelar la entrega (12 de octubre)

En GitHub Desktop: menú **Repository → Create tag** (o en github.com, Releases → Draft a new
release) con el nombre `v1.0`. A partir de ahí, solo se corrigen errores. También descargar el
repositorio como zip (Code → Download ZIP) y guardarlo aparte, por las dudas.

## Si algo falla

- "Page build failed" o Actions en rojo: captura del error al chat.
- La web abre pero el mapa de fondo no aparece: los pozos y los límites deberían verse igual sobre
  fondo papel (hay respaldo); si tampoco se ven, captura de la consola del navegador (F12 → Console).
- El link de Pages da 404 recién creado: esperar cinco minutos y recargar.
