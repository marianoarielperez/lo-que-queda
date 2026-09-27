# Lo que queda — cuando el petróleo se va

Visualización interactiva de los 44.390 pozos de hidrocarburos de la Cuenca del Golfo San Jorge
(Chubut y Santa Cruz) y de los 6.205 que quedaron dentro del ejido de Comodoro Rivadavia.
Presentación al Concurso Nacional de Visualización de Datos "Contar con Datos" 2026
(Universidad de San Andrés + Subsecretaría de Ciencia y Tecnología), categoría Exploración interactiva.

Datos abiertos de la Secretaría de Energía de la Nación (Capítulo IV – Pozos, CC-BY 4.0) y del
portal de datos abiertos de la Municipalidad de Comodoro Rivadavia (Censo 2022, INDEC).

## Correr localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
```

Regenerar los datos: ver `data-pipeline/README.md`.

## Documentación

- `CLAUDE.md` — reglas del proyecto e instrucciones para Claude Code
- `docs/specs/2026-09-18-lo-que-queda-design.md` — diseño completo
- `docs/plans/2026-09-18-plan-implementacion.md` — tareas por semana
- `docs/para-aldana.md` — tareas de Aldana (diseño, textos, entrega)
- `docs/para-mariano.md` — tareas de Mariano (datos, revisión)
- `docs/git-github.md` — crear el repositorio y publicar en GitHub Pages, paso a paso
- `docs/formulario.md` — textos para la inscripción
- `docs/investigacion-contexto.md` — fuentes oficiales del contexto (normativa, salida de YPF, ambiente)

## Licencias

Código: MIT. Datos derivados (`public/data/`): CC-BY 4.0, citando a la Secretaría de Energía y a la
Municipalidad de Comodoro Rivadavia. Autoría con seudónimo hasta el fallo del jurado.
