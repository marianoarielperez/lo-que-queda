# Textos para el formulario de inscripción

Borradores aprobados el 18/09/2026. Ajustar la voz antes de enviar; no cambiar cifras sin cotejar
con `public/data/resumen.json`.

## Categoría
Exploración interactiva

## Título
Lo que queda… cuando el petróleo se va

## Descripción metodológica (190 palabras; máximo 200)

Versión final de los autores (01/10/2026). Es el mismo texto que abre la ventana de Metodología de la web («Breve
descripción metodológica»). Incluye la declaración de IA, porque el formulario no tiene un campo propio para eso y el
Anexo A la pide en la descripción metodológica.

Para la producción de esta pieza se utilizaron datos abiertos de la Secretaría de Energía y de la Municipalidad de Comodoro Rivadavia y datos del INDEC (EPH).

La visualización consiste en un recorrido de ocho pasos, desde el nivel nacional al barrio, y finaliza en un mapa con filtros y descarga de datos en CSV.

Un script de Python procesa los datos y agrupa los 17 estados declarados de los pozos en cuatro categorías, descarta fechas inválidas, calcula cuándo produjo cada pozo por última vez y lo ubica en el ejido, en el barrio y en el radio censal. Todas las cifras de los datos provienen de ese script. «Abandonado» refiere al estado declarado por la operadora y no a la condición física del pozo; del mismo modo, un pozo «activo» no necesariamente registra producción.

Se utilizó Claude (Anthropic), con supervisión humana, para la limpieza y organización de los datos y asistencia en el código de procesamiento y del desarrollo web. No se generaron imágenes con IA. Las decisiones de diseño visual, la selección de contenidos, los textos finales y la composición de la pieza fueron realizados por los autores.

## Fuente de los datos (con links)

- Secretaría de Energía — Capítulo IV – Pozos: http://datos.energia.gob.ar/dataset/c846e79c-026c-4040-897f-1ad3543b407c (CC-BY 4.0), descargado 18/09/2026
- Secretaría de Energía — Listado de pozos cargados por empresas operadoras (mismo dataset), actualizado 20/10/2025
- Secretaría de Energía — Serie histórica de producción de petróleo por cuenca y sub-tipo de recurso (Capítulo IV)
- Municipalidad de Comodoro Rivadavia — datos.comodoro.gov.ar: límites administrativos 2025; radios censales 2022; población por radio censal (Censo 2022, INDEC)
- Contexto: Resolución SE 5/96 (InfoLeg); YPF Form 20-F 2024 (SEC), Nota 17; Decreto Chubut 1509/2024 (Boletín Oficial); Municipalidad de Comodoro Rivadavia, comunicado del 27/8/2024

## Declaración de uso de IA (Anexo A)

Herramientas: Claude (Anthropic). Etapas: limpieza y cruce de datos, asistencia en la escritura de
código de procesamiento y de la web, búsqueda y verificación de fuentes documentales, generación de
ideas. Finalidad: acelerar el trabajo técnico bajo supervisión humana. Todas las decisiones de diseño
visual, la selección de qué mostrar, los textos finales y la composición de la pieza fueron
realizadas por las autoras/es. No se utilizó IA generativa para producir imágenes, gráficos ni la
visualización final.

## Tipo de visualización
Aplicación web interactiva (mapa con recorrido guiado y exploración libre). Link a la aplicación +
video de 1 minuto.

## Pendientes
- Seudónimo: ______
- Institución / aval: verificar qué acepta el formulario para presentación personal.
- Link final de GitHub Pages: ______
- Link del video: ______
