# Cierre del recorrido, visualizador y Metodología — documento de diseño

Fecha: 27 de septiembre de 2026. Estado: aprobado por Mariano en la conversación del 27/09 (tres rondas de preguntas);
implementado el 27/09 (plan `docs/plans/2026-09-27-cierre-y-visualizador.md`, prueba `scripts/prueba_navegacion.mjs`).
Reemplaza el comportamiento del paso 8 descrito en el spec del 18/09 (§1: "al final se libera el panel de exploración").

## 1. Problema

Hoy el paso 8 es a la vez cierre del recorrido y modo exploración:
- la tarjeta 8 ocupa la izquierda y el panel la derecha: el mapa para explorar queda reducido al centro;
- la ficha de un pozo se abre abajo a la izquierda, encima de la tarjeta 8;
- al seguir bajando aparece la sección de Metodología con su fondo, y el panel queda flotando encima;
- el borde de esa sección ya asoma abajo y corta el mapa y el botón de zoom.

## 2. Solución: una página con tres estados

| Estado | Dirección | Qué se ve |
|---|---|---|
| Recorrido | `…/` | Portada y pasos 1 a 8. La página termina en la tarjeta 8. |
| Visualizador | `…/#explorar` | Mapa entero con gestos libres y el panel; sin tarjetas. |
| Metodología | `…/#metodologia` | Ventana superpuesta sobre el recorrido o el visualizador. |

Se descartaron: dos páginas separadas (cada cambio recarga mapa y datos; sin `localStorage` no hay forma de
recordar el estado del visualizador) y estados solo en JavaScript (sin link directo ni botón "Atrás").

### 2.1 Recorrido

- **Tarjeta 8 (cierre):** el texto sigue igual (lo deciden los autores) y termina con dos botones del mismo estilo
  que "Desplazá para empezar": **"Explorá el mapa"** (abre el visualizador) y **"Metodología"** (abre la ventana).
- El panel de exploración ya no se abre solo en el paso 8 (ni en escritorio ni en celular).
- Debajo de la tarjeta 8 no hay nada más: la sección de Metodología sale del flujo de la página.
- **Portada:** debajo de "Desplazá para empezar", dos enlaces chicos: **"Ir directo al mapa"** y **"Metodología"**.
- **Pozos durante el recorrido:** el tooltip al pasar el mouse se mantiene; el clic **no** abre la ficha (la ficha es
  del visualizador). Así nunca se superpone con una tarjeta.
- El resto del recorrido (pasos 1 a 7, disparo de pasos, leyenda, gestos desactivados) no cambia.

### 2.2 Visualizador (`#explorar`)

- Se entra solo con "Explorá el mapa" (tarjeta 8), "Ir directo al mapa" (portada) o el link `…/#explorar`.
- Las tarjetas del recorrido se ocultan y el recorrido queda en pausa (scrollama deshabilitado).
- **Mapa libre:** la rueda acerca y aleja, un dedo mueve el mapa, doble clic acerca, teclado activo. No hacen falta
  los gestos cooperativos (Ctrl + rueda, dos dedos): en el visualizador no hay nada que desplazar.
- **Panel:** a la derecha en escritorio; hoja inferior plegable en celular (como hoy). En el encabezado, arriba del
  título, una fila de enlaces chicos: **"← Volver al inicio"** y **"Metodología"**, siempre a la vista (también
  con el panel plegado).
- **Ficha:** abajo a la izquierda (ya no hay tarjeta ahí). La leyenda flotante no se muestra: los conteos por estado
  están en el panel.
- **Primera entrada** (o entrada directa por el link): toda la cuenca (vista del paso 8), todos los estados, sin
  filtros ni capas extra. Si los pozos todavía no llegaron, el panel dice "Cargando el mapa…" hasta que estén.
- **Reentrada** (dentro de la misma visita; sin `localStorage`, una recarga vuelve a empezar): el visualizador aparece
  como se dejó: filtros, capas, vista del mapa (centro y zoom) y ficha abierta.
- El foco pasa al título del panel al entrar.

### 2.3 Salir del visualizador

- **"← Volver al inicio"** lleva a la portada (arriba de todo, el mapa en la vista de la portada).
- **"Atrás"** del navegador (o el gesto de volver del celular) vuelve **adonde estaba** la persona antes de entrar:
  la tarjeta 8, la portada u otro paso; el mapa vuelve a la vista de ese paso.
- En los dos casos el recorrido se reanuda (scrollama habilitado) y se reaplica el paso visible.

### 2.4 Ventana de Metodología (`#metodologia`)

- Elemento `<dialog>` nativo abierto con `showModal()`: el foco queda adentro, Escape la cierra.
- Tamaño: 80 % del alto de la pantalla, ancho de lectura (máximo ~800 px), centrada, con el fondo atenuado.
  En celular (≤ 700 px) ocupa toda la pantalla.
- Se cierra con el botón ×, con Escape, tocando fuera de la ventana o con "Atrás". Al cerrar, el foco vuelve al
  botón que la abrió.
- Se abre desde: la tarjeta 8, la portada, el encabezado del panel, el enlace "Metodología" del pie del panel y el
  link `…/#metodologia` (que la muestra sobre la portada; al cerrarla queda la portada).
- El contenido es la sección actual de `index.html`, que `src/metodologia.js` sigue completando desde
  `resumen.json` (sin cambios en esa lógica). La ventana se desplaza por dentro; la página de atrás no.

### 2.5 Dirección e historial

- Entrar al visualizador agrega una entrada al historial con `#explorar` y guarda la posición de desplazamiento del
  recorrido; "Atrás" la recupera.
- Abrir la Metodología agrega una entrada al historial: `#metodologia` si detrás está el recorrido; si detrás está el
  visualizador, la dirección sigue siendo `#explorar` (entrada con marca de estado). En los dos casos "Atrás" cierra
  la ventana y deja lo de atrás como estaba.
- Cargar la página con `#explorar` abre directo el visualizador; con `#metodologia`, la ventana sobre la portada.
- "← Volver al inicio" navega a la dirección sin `#` y lleva el desplazamiento a cero.

## 3. Código

| Módulo | Cambio |
|---|---|
| `src/navegacion.js` (nuevo) | Los tres estados: lee y escribe la dirección, escucha `hashchange`/`popstate`, guarda y recupera el desplazamiento, abre y cierra la ventana, pone la clase `modo-explorar` en `body`. API chica: `iniciarNavegacion({ alEntrar, alSalir })`, `irAlVisualizador()`, `irAlInicio()`, `abrirMetodologia(disparador)`. |
| `src/story.js` | Tarjeta 8 con los dos botones; sin `alTerminar`/panel automático; `pausar()`, `reanudar()` y `reaplicar()` del recorrido. |
| `src/explore.js` | El panel se muestra en el visualizador; guarda y restaura su estado (filtros, vista, ficha); encabezado con "← Volver al inicio" y "Metodología"; la ficha solo abre en el visualizador. |
| `src/map.js` | `habilitarExploracion(on)` pasa a gestos libres (sin gestos cooperativos); `vista()`/`irA()` para guardar y restaurar centro y zoom. |
| `src/main.js` | Conecta navegación, recorrido y visualizador; respeta la entrada directa por `#explorar` mientras cargan los datos. |
| `index.html` | Metodología dentro de un `<dialog>`; enlaces chicos en la portada; fila de enlaces en el encabezado del panel. |
| `src/styles.css` | Estado `modo-explorar` (sin tarjetas, panel visible), estilos de la ventana y de los enlaces nuevos; se quitan las reglas de la sección de metodología en la página. |

Sin librerías nuevas. Textos nuevos de interfaz: "Explorá el mapa", "Metodología", "Ir directo al mapa",
"← Volver al inicio", "Cerrar la metodología" (etiqueta accesible del ×).

## 4. Accesibilidad

- Todos los disparadores son `<button>` o `<a href="#…">` reales, con foco visible.
- La ventana: `aria-labelledby` al título "Metodología y fuentes"; foco atrapado por `showModal()`; Escape cierra.
- Al entrar al visualizador el foco va al título del panel; al volver, al botón o enlace de destino (portada:
  "Desplazá para empezar"; "Atrás": el elemento que abrió el visualizador, si sigue en la página).
- "Reducir movimiento": los cambios de vista y el desplazamiento al inicio van sin animación.

## 5. Pruebas

- Prueba automática con capturas (Chrome sin ventana, escritorio 1366 × 800 y celular 390 × 844):
  recorrido hasta la tarjeta 8 → "Explorá el mapa" → filtro + ficha → "← Volver al inicio" (portada) →
  "Ir directo al mapa" (el filtro y la ficha siguen) → "Atrás" (portada) → tarjeta 8 → "Metodología" → Escape;
  carga directa de `#explorar` y de `#metodologia`; la tarjeta 8 es lo último de la página.
- Verificar que en el recorrido el clic en un pozo no abre la ficha y el tooltip sigue.
- `npm run build` sin errores; revisar en Pages después de publicar.

## 6. Fuera de alcance

- Los textos de las tarjetas (p. ej., sacar "Exploralo." de la tarjeta 8: lo decide Aldana).
- El diseño visual fino de botones, ventana y panel (tarea 2.4, Aldana).
