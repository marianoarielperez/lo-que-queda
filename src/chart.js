// Gráfico del paso 2 (País): producción anual de petróleo por cuenca (m³), 2006 → último año completo.
// Un solo eje, líneas finas, etiquetas directas al final de cada línea, sin leyenda aparte.
// Las tres cuencas chicas terminan casi en el mismo punto: van con una sola etiqueta en gris.

import * as d3 from 'd3';
import { PALETA, ESTADOS } from './paleta.js';
import { pct } from './data.js';

const SERIES = [
  { key: 'cuenca_gsj', nombre: 'Golfo San Jorge', color: ESTADOS[2].hex, etiqueta: true },   // rojo quemado: la protagonista
  { key: 'cuenca_neuquina', nombre: 'Neuquina', color: ESTADOS[0].hex, etiqueta: true },     // azul
  { key: 'cuenca_cuyana', nombre: 'Cuyana', color: '#9a978f' },
  { key: 'cuenca_austral', nombre: 'Austral', color: '#b5b1a7' },
  { key: 'cuenca_noroeste', nombre: 'Noroeste', color: '#c9c5bb' },
];
const CHICAS = SERIES.filter((s) => !s.etiqueta);
const ALTO_RENGLON = 12; // separación mínima entre etiquetas (px del viewBox)

const millones = (v) => `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;

export function dibujarProduccion(el, produccion) {
  if (!el) return;
  const datos = produccion.anual.filter((d) => d.anio <= produccion.ultimo_anio_completo);
  const primero = datos[0], ult = datos[datos.length - 1];
  const W = el.clientWidth || 336, H = 190, m = { t: 12, r: 96, b: 24, l: 40 };
  const resumen = SERIES.filter((s) => s.etiqueta)
    .map((s) => `${s.nombre}: de ${pct(primero[s.key] / 1e6)} a ${pct(ult[s.key] / 1e6)} millones de m³`).join('; ');
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%')
    .attr('role', 'img')
    .attr('aria-label', `Producción anual de petróleo por cuenca, ${primero.anio} a ${ult.anio}. ${resumen}. `
      + `${CHICAS.map((s) => s.nombre).join(', ')}: menos de ${pct(d3.max(CHICAS, (s) => primero[s.key]) / 1e6)} millones cada una.`);
  const x = d3.scaleLinear().domain(d3.extent(datos, (d) => d.anio)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(datos, (d) => d3.max(SERIES, (s) => d[s.key]))]).nice().range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format('d')).tickSize(0))
    .call((g) => g.select('.domain').attr('stroke', PALETA.urbanoBorde))
    .selectAll('text').attr('fill', PALETA.textoSec).attr('font-size', 11);
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(3).tickFormat(millones).tickSize(-(W - m.l - m.r)))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('line').attr('stroke', PALETA.urbanoBorde))
    .selectAll('text').attr('fill', PALETA.textoSec).attr('font-size', 11);

  const linea = (key) => d3.line().x((d) => x(d.anio)).y((d) => y(d[key])).curve(d3.curveMonotoneX);
  for (const s of SERIES) {
    svg.append('path').datum(datos).attr('d', linea(s.key))
      .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.key === 'cuenca_gsj' ? 2.5 : 1.5);
  }

  // Etiquetas al final de las líneas; si dos quedan muy cerca, se separan hacia arriba.
  const etiquetas = [
    ...SERIES.filter((s) => s.etiqueta).map((s) => ({ renglones: [s.nombre], y: y(ult[s.key]), color: s.color, peso: s.key === 'cuenca_gsj' ? 600 : 400 })),
    { renglones: [CHICAS.slice(0, -1).map((s) => s.nombre).join(', '), `y ${CHICAS[CHICAS.length - 1].nombre}`],
      y: d3.mean(CHICAS, (s) => y(ult[s.key])), color: PALETA.textoSec, peso: 400 },
  ].sort((a, b) => b.y - a.y); // de abajo hacia arriba
  let techo = H - m.b; // borde de arriba de la etiqueta anterior; la primera no baja del eje (ni pisa los años)
  for (const e of etiquetas) {
    const debajo = (e.renglones.length - 1) * ALTO_RENGLON + 2; // lo que ocupa bajo la línea base del primer renglón
    e.base = Math.min(e.y + 4, techo - debajo);
    techo = e.base - 10;
  }
  for (const e of etiquetas) {
    const t = svg.append('text').attr('x', x(ult.anio) + 6).attr('y', e.base)
      .attr('fill', e.color).attr('font-size', 11).attr('font-weight', e.peso);
    e.renglones.forEach((r, i) => t.append('tspan').attr('x', x(ult.anio) + 6).attr('dy', i ? ALTO_RENGLON : 0).text(r));
  }
  svg.append('text').attr('x', m.l).attr('y', m.t - 2).attr('fill', PALETA.textoSec).attr('font-size', 10)
    .text('millones de m³ de petróleo por año');
}
