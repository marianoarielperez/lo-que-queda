# Imagen satelital y ubicación en el visualizador — documento de diseño

Fecha: 27 de septiembre de 2026. Estado: aprobado por Mariano en la conversación del 27/09 (dos rondas de preguntas);
implementado el 27/09 (plan `docs/plans/2026-09-27-satelite-y-ubicacion.md`).
Se suma al visualizador de `docs/specs/2026-09-27-cierre-y-visualizador-design.md` (`…/#explorar`).

## 1. Qué se agrega

Dos botones sobre el mapa, **solo en el visualizador** (en el recorrido no aparecen):
- **"Satélite" / "Mapa":** alterna entre el mapa papel (OpenFreeMap) y una imagen satelital híbrida, para ver que
  los pozos están entre las casas.
- **Ubicación** (ícono de mira): muestra dónde está la persona, pensado para recorrer Comodoro con el celular.

En la computadora van abajo a la derecha, sobre los botones de zoom y al costado del panel. En el celular, arriba a la
derecha con los créditos del mapa (el panel ocupa el pie).

## 2. Imagen satelital

- **Fuente:** Esri World Imagery (`server.arcgisonline.com/…/World_Imagery/MapServer/tile/{z}/{y}/{x}`), sin clave.
  Atribución: "Imagen satelital © Esri — Esri, Vantor, Earthstar Geographics y la comunidad de usuarios GIS" (la
  misma que usaron los autores en otras iniciativas). Aparece en los créditos del mapa solo mientras la imagen se ve,
  y en la metodología.
  - Salvedad anotada: el servicio anda sin clave, pero los términos de Esri hablan de uso con cuenta de ArcGIS;
    para una pieza no comercial con atribución es un uso habitual (decisión de los autores).
  - Descartadas: Sentinel‑2 de EOX (libre no comercial, pero 10 m por píxel: no se distinguen casas), mosaicos del
    IGN (Landsat, baja resolución), ortofoto municipal (no publicada; la IDE‑CR está en desarrollo).
- **Híbrido:** la imagen va apenas arriba del fondo del estilo; en modo satélite se apagan las capas de relleno del
  mapa papel (agua, usos del suelo, edificios) y quedan calles, rutas, límites y nombres encima.
- **Pozos sobre la imagen:** borde blanco fino (0,8 px). Los colores no cambian (paleta validada). El anillo del pozo
  de la ficha y el de las áreas sin concesión pasan a blanco en ese modo.
- **Estado:** es parte del visualizador (se guarda al salir y vuelve igual al reentrar). El recorrido siempre muestra
  el mapa papel (cada paso fuerza `satelite: false`).

## 3. Ubicación

- **Primer toque:** pide permiso al navegador y empieza a seguir la posición (`watchPosition`, alta precisión).
- **Dentro de la cuenca** (el rectángulo que cubren los pozos, con un margen de 0,25°): el mapa vuela hasta la
  persona (zoom mínimo 14) y la sigue mientras se mueve. Si mueve el mapa con el dedo o el mouse, deja de seguirla
  pero el punto queda; otro toque vuelve a centrar y seguir.
- **Fuera de la cuenca:** aviso "Estás fuera de la cuenca del Golfo San Jorge." y el mapa no se mueve (el punto se
  dibuja igual, por si la persona se desplaza hasta ahí).
- **Tocar con el seguimiento activo** (o estando fuera de la cuenca) apaga la ubicación y borra el punto.
- **Punto:** negro con borde blanco, con un círculo de precisión tenue (no se confunde con el azul de "Activo").
- **Errores:** permiso negado → "No se pudo obtener tu ubicación: el permiso está desactivado."; otros →
  "No se pudo obtener tu ubicación."; navegador sin geolocalización → "Este navegador no permite ubicarte."
  Los avisos aparecen arriba, al centro, unos segundos (`role="status"`).
- **Al salir del visualizador:** se deja de seguir y se borra el punto.
- **Privacidad y límite del dato:** la ubicación se usa solo en el dispositivo; no se guarda ni se envía. No se
  calcula nada con ella (ni distancias ni "pozos cerca"): la regla de no calcular distancias a viviendas sigue en pie.
  Se agrega una línea a la metodología (borrador, lo revisan los autores).
- Funciona en celular y en computadora (en la computadora la posición suele ser aproximada). Requiere HTTPS
  (GitHub Pages lo es).

## 4. Código

| Módulo | Cambio |
|---|---|
| `src/ubicacion.js` (nuevo) | Botón, `watchPosition`, estados (apagado, buscando, siguiendo, quieto), avisos. No importa MapLibre: usa la API del mapa. |
| `src/map.js` | Estado `satelite`; fuente y capa de Esri; rellenos apagados en satélite; borde blanco de pozos y anillos; capas del punto y la precisión; API `agregarControl(elemento)`, `mostrarUbicacion(pos \| null)`, `limitesCuenca()`, `alMoverConLaMano(fn)`. |
| `src/explore.js` | Botón "Satélite"/"Mapa"; monta la ubicación; `salir()` la apaga; `estadoInicial()` con `satelite: false`. |
| `src/story.js` | Cada paso aplica `satelite: false`. |
| `index.html` | Elemento de avisos del mapa; líneas de Esri y de privacidad en la metodología. |
| `src/styles.css` | Botones del mapa (40 px), estado de la mira, avisos; en celular se ocultan solo los botones de zoom. |

Sin librerías nuevas.

## 5. Pruebas

Se amplía `scripts/prueba_navegacion.mjs` (ubicación simulada con los permisos de Chrome):
- Satélite: el botón existe en el visualizador; al tocarlo dice "Mapa" y los créditos incluyen a Esri; al volver al
  inicio los créditos ya no la incluyen; al reentrar sigue en satélite.
- Ubicación en Km 3: el botón queda en "siguiendo" y no hay aviso. En Buenos Aires: aviso "Estás fuera…".
  Al salir del visualizador, la ubicación queda apagada.
