# Textos para el formulario de inscripción

Borradores aprobados el 18/09/2026. Ajustar la voz antes de enviar; no cambiar cifras sin cotejar
con `public/data/resumen.json`.

## Categoría
Exploración interactiva

## Título
Lo que queda… cuando el petróleo se va

## Descripción metodológica (194 palabras; máximo 200)

Versión final de los autores (01/10/2026). Es el mismo texto que abre la ventana de Metodología de la web («Breve
descripción metodológica»). Incluye la declaración de IA, porque el formulario no tiene un campo propio para eso y el
Anexo A la pide en la descripción metodológica.

Para la producción de esta pieza se utilizaron datos abiertos de la Secretaría de Energía y de la Municipalidad de Comodoro Rivadavia y datos del INDEC (EPH).

La visualización consiste en un recorrido de ocho pasos, desde el nivel nacional al barrio, y finaliza en un mapa con filtros y descarga de datos en CSV.

Un script de Python procesa los datos y agrupa los 17 estados declarados de los pozos en cuatro categorías, descarta fechas inválidas, calcula cuándo produjo cada pozo por última vez y lo ubica en el ejido, en el barrio y en el radio censal. Las cifras sobre los pozos, su producción y la población provienen de ese script. «Abandonado» refiere al estado declarado por la operadora y no a la condición física del pozo; del mismo modo, un pozo «activo» no necesariamente registra producción.

Se utilizó Claude (Anthropic), con supervisión humana, para la limpieza y organización de los datos y asistencia en el código de procesamiento y del desarrollo web. No se generaron imágenes con IA. Las decisiones de diseño visual, la selección de contenidos, los textos finales y la composición de la pieza fueron realizados por los autores.

## Fuente de los datos (con links)

- Secretaría de Energía — Capítulo IV – Pozos: http://datos.energia.gob.ar/dataset/c846e79c-026c-4040-897f-1ad3543b407c (CC-BY 4.0), descargado 18/09/2026
- Secretaría de Energía — Listado de pozos cargados por empresas operadoras (mismo dataset), actualizado 20/10/2025
- Secretaría de Energía — Serie histórica de producción de petróleo por cuenca y sub-tipo de recurso (Capítulo IV)
- Municipalidad de Comodoro Rivadavia — datos.comodoro.gov.ar: límites administrativos 2025; radios censales 2022; población por radio censal (Censo 2022, INDEC)
- Contexto: Resolución SE 5/96 (InfoLeg); YPF Form 20-F 2024 (SEC), Nota 17; Decreto Chubut 1509/2024 (Boletín Oficial); Municipalidad de Comodoro Rivadavia, comunicado del 27/8/2024

## Declaración de uso de IA (Anexo A)

Igual que en la Metodología de la web (04/10/2026, texto de los autores).

**Para qué se utilizó**

Se utilizó Claude (Anthropic), bajo supervisión humana, como herramienta de apoyo para la limpieza,
organización y cruce de datos, y para la asistencia en la escritura y revisión del código del script
de procesamiento y del desarrollo web. En la investigación documental también sirvió de apoyo para
buscar y cotejar fuentes, a partir de los casos y ejemplos que plantearon los autores. Su finalidad
fue agilizar el trabajo.

**Para qué no se utilizó**

La IA no se utilizó para generar imágenes, gráficos, mapas ni la visualización final. La
verificación final de las fuentes, el trabajo de campo, las fotografías, la narrativa visual, el
guion, la selección y jerarquización de contenidos, las decisiones de diseño y la composición final
de la pieza fueron realizados por los autores.

## Tipo de visualización
Aplicación web interactiva (mapa con recorrido guiado y exploración libre). Link a la aplicación +
video de 1 minuto.

## Pendientes
- Seudónimo: ______
- Institución / aval: verificar qué acepta el formulario para presentación personal.
- Link final de GitHub Pages: ______
- Link del video: ______
