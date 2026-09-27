# Para Aldana — qué tenés que hacer y cómo

Vos sos la autora de la pieza: la parte visual, los textos y la entrega son tuyas. Mariano procesa
datos y revisa código; Claude escribe código y datos bajo supervisión. Este documento tiene tus
tareas en orden, con lo que necesitás para cada una. Fechas: cierre 15 de octubre; enviamos el 13 o 14.

## Antes que nada (esta semana, hasta el 25/9)

**1. Crear el repositorio en GitHub y publicar la web.** Está explicado paso a paso en
`docs/git-github.md`. Es lo primero porque, una vez publicado, cada cambio que hagamos se ve en un
link y podés revisar desde el celular. Tiempo: 30–40 minutos la primera vez.

**2. Abrir el formulario de inscripción** en udesa.edu.ar/contarcondatos y anotar:
- qué opciones da el campo "Institución" y "Aval institucional" cuando la presentación es personal
  (si obliga a poner una institución, avisar: cambia cómo nos presentamos);
- si el formulario permite equipo de dos personas y cómo se cargan;
- qué formatos acepta para el archivo y el link.
No hace falta completarlo todavía. Solo mirar y anotar en `docs/formulario.md`, sección "Pendientes".

**3. Elegir el seudónimo.** Con él se presenta el trabajo; los nombres reales van solo en el
formulario. Ponerlo en `docs/formulario.md`.

**4. Elegir el nombre definitivo de la pieza.** Hoy se llama "Lo que queda — cuando el petróleo se
va". Si te gusta, queda. Si no, proponé otro; se cambia en `index.html` (título), `src/story.js`
(portada) y `docs/formulario.md`.

## Diseño (semana 2, del 26/9 al 2/10)

La paleta ya está decidida y validada (Sobria · papel). Está en `src/paleta.js` y en
`docs/specs/2026-09-18-lo-que-queda-design.md`, sección 4. **No se cambian los cuatro colores de estado**
sin volver a validar (Mariano sabe cómo). Todo lo demás es tuyo:

**5. Boceto de tres cosas**, en lo que uses (Figma, papel, Canva, PowerPoint):
- la **tarjeta** del recorrido: cómo se ve el kicker ("Paso 5 · Km 3"), la cifra grande, el título,
  el texto y la fuente;
- la **leyenda** (los cuatro estados con sus conteos) y el **panel de exploración** (filtros);
- la **portada**: título, bajada, y qué se ve del mapa detrás.
Sacale foto o captura y mandala al chat. Con eso Claude escribe el CSS.

**6. Tipografía.** La propuesta es Fraunces (cifras y títulos) + Source Sans 3 (texto), las dos
gratuitas en Google Fonts. Si preferís otras, que sean de Google Fonts (por licencia y porque no
hay que subir archivos). Máximo dos familias.

**7. Revisión en el navegador.** Cuando el diseño esté aplicado, lo abrís en el link de GitHub Pages,
en la computadora y en tu celular, y anotás todo lo que no te cierra: tamaños, espacios, colores del
mapa base, cómo se ve el punto de un pozo cuando hacés zoom. Lista en el chat, sin filtro; se corrige
en tandas.

## Textos (semana 2)

**8. Las siete tarjetas del recorrido.** Los borradores están en `src/story.js`, dentro de
`definirPasos()`. Cada tarjeta tiene `kicker`, `cifra`, `titulo`, `texto` y `fuente`. Reglas:
- 60 a 90 palabras por `texto`; una sola idea por tarjeta;
- voseo, castellano rioplatense, sin tecnicismos que no se expliquen;
- **las cifras no se escriben a mano**: están como `${fmt(c.total)}`, `${fmt(e.Abandonado)}`, etc.
  y salen del archivo `resumen.json`. Podés mover esos pedazos de lugar en la frase, pero no
  reemplazarlos por un número tipeado;
- las afirmaciones de contexto (Resolución 5/96, YPF, CH-679) tienen fuente oficial verificada en
  `docs/investigacion-contexto.md`. No agregar hechos que no estén ahí.
Si te resulta incómodo editar el archivo, escribí las tarjetas en un documento aparte con el número
de paso y Mariano o Claude las pasan.

Nota: la tarjeta 5 quedó larga (unas 110 palabras) porque suma los barrios con más pozos y el caso de
General Mosconi (195 pozos, ninguno activo). Decidí vos: recortar, o partirla en dos tarjetas.

**9. Tres textos cortos más:**
- el título y la bajada de la portada;
- el texto que explica "Abandonado" en la ficha (hoy: "Estado declarado por la operadora ante la
  Secretaría de Energía. No describe el estado físico del pozo."). Se puede mejorar sin cambiar el sentido;
- el párrafo de apertura de la sección "Metodología y fuentes".

## Prueba con gente (semana 3, del 3 al 9/10)

**10. Conseguir dos o tres personas** que no sepan nada del proyecto (no del rubro petrolero),
sentarlas frente a la web sin explicarles nada, y anotar: ¿entienden qué significa "abandonado"?
¿encuentran cómo filtrar? ¿qué les llama la atención primero? ¿qué no entienden? Diez minutos por
persona. Se ajustan textos con eso.

## Entrega (semana 4, del 10 al 15/10)

**11. Video de un minuto.** Grabar la pantalla (OBS, o la grabación de Windows con Win+G) a
1920×1080: el recorrido completo con scroll suave (unos 40 segundos) y 15–20 segundos de exploración
(activar un filtro, hacer clic en un pozo, encender la población). Sin voz ni música hace falta;
si querés música, que sea libre de derechos. Subirlo a YouTube o Vimeo como "no listado".

**12. Captura de portada** a 1920×1080 en PNG, por si el formulario exige un archivo.

**13. Formulario.** Con `docs/formulario.md` a mano: categoría, título, descripción metodológica
(ya escrita, ≤ 200 palabras; podés ajustar la voz), fuentes con links, declaración de IA, seudónimo,
link a la web y al video. Enviar el 13 o 14, guardar el acuse (captura o mail).

## Cómo trabajamos

- Revisión corta cada tres o cuatro días mirando el link publicado (miércoles y domingo, por ejemplo).
- Todo lo que quieras cambiar, lo pedís en el chat con Claude o a Mariano. No hace falta que toques
  código si no querés; sí conviene que edites los textos vos misma, aunque sea en un documento aparte.
- Si algo del diseño choca con una regla (la paleta, las cifras a mano, el vocabulario del dato), te
  lo vamos a decir. Las reglas están en `CLAUDE.md`; son ocho y están ahí por el jurado.
