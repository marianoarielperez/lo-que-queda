// Sección "Metodología y fuentes". El texto vive en index.html (lo editan los autores); acá solo se
// completan, desde resumen.json, las cifras marcadas con data-cifra, la lista de datasets y la tabla
// de equivalencias de estados. Así ninguna cifra de la metodología se tipea a mano.

import { ESTADOS } from './paleta.js';
import { fmt, esc, mesAnio } from './data.js';

export function montarMetodologia(R) {
  const sec = document.getElementById('metodologia');
  if (!sec) return;

  // Cifras: data-cifra="ruta.en.resumen"; data-formato="cantidad" (claves de un objeto) o "mes" ("2017-01").
  for (const el of sec.querySelectorAll('[data-cifra]')) {
    const v = el.dataset.cifra.split('.').reduce((o, k) => o?.[k], R);
    if (v === undefined || v === null) {
      console.warn(`Metodología: no hay "${el.dataset.cifra}" en resumen.json`);
      el.textContent = '—';
      continue;
    }
    const f = el.dataset.formato;
    el.textContent = f === 'cantidad' ? fmt(Object.keys(v).length) : f === 'mes' ? mesAnio(v) : fmt(v);
  }

  // Datasets (procesar.py → DATASETS)
  document.getElementById('met-datasets').innerHTML = (R.datasets || []).map((d) =>
    `<li><a href="${esc(d.url)}">${esc(d.titulo)}</a>, ${esc(d.organismo)}. Para: ${esc(d.uso)}. `
    + `Descargado el ${esc(d.descarga)}${d.licencia ? `; licencia ${esc(d.licencia)}` : ''}.</li>`).join('');

  // Tabla de equivalencias: un grupo por <tbody>, en el orden fijo de los estados; dentro, de más a menos pozos.
  const cuenta = R.cuenca_por_estado_original || {};
  const tabla = document.getElementById('met-estados');
  for (const e of ESTADOS) {
    const originales = Object.keys(R.grupos_de_estado).filter((k) => R.grupos_de_estado[k] === e.nombre)
      .sort((a, b) => (cuenta[b] || 0) - (cuenta[a] || 0));
    if (!originales.length) continue;
    const tb = document.createElement('tbody');
    tb.innerHTML = originales.map((o, i) => `<tr>${i === 0
      ? `<th scope="rowgroup" rowspan="${originales.length}"><span class="ley-dot" style="background:${e.hex}"></span>${e.nombre}</th>` : ''}`
      + `<td>${esc(o)}</td><td class="num">${fmt(cuenta[o] || 0)}</td></tr>`).join('');
    tabla.appendChild(tb);
  }
}
