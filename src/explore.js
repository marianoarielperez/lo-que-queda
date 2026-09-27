// Panel de exploración: filtros, leyenda con conteos, buscador, ficha por pozo y tooltip.
// Los controles no guardan estado propio: se resincronizan con mapa.estado después de cada cambio
// (también cuando el recorrido cambia de paso), así nunca muestran un filtro que no está aplicado.

import { ESTADOS, POBLACION_RAMPA, CORTES_POBLACION } from './paleta.js';
import { cargarFicha, cargarSiglas, normalizarSigla, fmt, esc, mesAnio, reducirMovimiento, TRAMOS_SIN_PRODUCIR } from './data.js';

const MAX_RESULTADOS = 12;

export function montarExploracion({ mapa, pozos, resumen }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('explore');
  const meta = pozos.meta;

  // Estados que existen en el dato (los que tienen 0 pozos no se listan)
  const base = contar(pozos.cols.estado_cod, ESTADOS.length);
  const estados = ESTADOS.filter((e) => base[e.cod] > 0);

  // ---- filtro de estado: una casilla por estado, con su conteo alineado a la derecha ----
  const fEstado = $('f-estado');
  const cuentaEstado = new Map();
  for (const e of estados) {
    const id = `est-${e.cod}`;
    const row = document.createElement('div');
    row.className = 'filtro-inline';
    row.innerHTML = `<input type="checkbox" id="${id}" checked><label for="${id}"><span class="ley-dot" style="background:${e.hex}"></span>${e.nombre}<span class="cuenta"></span></label>`;
    row.querySelector('input').addEventListener('change', (ev) => {
      ev.target.checked ? mapa.estado.estadosVisibles.add(e.cod) : mapa.estado.estadosVisibles.delete(e.cod);
      mapa.aplicar();
    });
    cuentaEstado.set(e.cod, row.querySelector('.cuenta'));
    fEstado.appendChild(row);
  }

  // ---- operadora (ordenada por cantidad de pozos), yacimiento, provincia ----
  llenarSelect($('f-empresa'), meta.empresas, contar(pozos.cols.empresa_cod, meta.empresas.length), (v) => v || '(sin empresa)');
  llenarSelect($('f-yacimiento'), meta.yacimientos, contar(pozos.cols.yac_cod, meta.yacimientos.length), (v) => v || '(sin yacimiento)', 60);
  const numONull = (v) => (v === '' ? null : Number(v));
  $('f-empresa').addEventListener('change', (ev) => mapa.aplicar({ empresa: numONull(ev.target.value) }));
  $('f-yacimiento').addEventListener('change', (ev) => mapa.aplicar({ yacimiento: numONull(ev.target.value) }));
  $('f-provincia').addEventListener('change', (ev) => mapa.aplicar({ provincia: numONull(ev.target.value) }));
  $('f-poblacion').addEventListener('change', (ev) => mapa.aplicar({ poblacion: ev.target.checked }));
  $('f-concesiones').addEventListener('change', (ev) => mapa.aplicar({ concesiones: ev.target.checked }));
  $('f-barrios').addEventListener('change', (ev) => mapa.aplicar({ barrios: ev.target.checked }));

  // ---- tiempo sin producir (serie mensual; tramos definidos en data.js) ----
  const T = resumen.trayectoria;
  if (T) {
    const porTramo = contar(pozos.cols.tramo_sp, TRAMOS_SIN_PRODUCIR.length);
    const etiquetas = {
      ultimo_anio: 'Produjo en los últimos 12 meses',
      '1_a_5': 'Entre 1 y 5 años sin producir',
      mas_de_5: 'Más de 5 años sin producir',
      nunca: `Ningún mes de producción desde ${T.cobertura.desde.slice(0, 4)}`,
    };
    const sel = $('f-sinprod');
    TRAMOS_SIN_PRODUCIR.forEach((clave, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = `${etiquetas[clave]} (${fmt(porTramo[i])})`;
      sel.appendChild(o);
    });
    $('f-sinprod-nota').textContent = `Según la producción mensual declarada, de ${mesAnio(T.cobertura.desde)} a ${mesAnio(T.cobertura.hasta)}.`;
    sel.addEventListener('change', (ev) => mapa.aplicar({ sinProducir: numONull(ev.target.value) }));
  } else {
    $('f-sinprod').closest('.filtro').classList.add('hidden');
  }

  $('n-total').textContent = fmt(pozos.n);

  // ---- leyenda (recorrido) y controles del panel: se redibujan con cada cambio del mapa ----
  const leyenda = $('leyenda');
  function sincronizar(e) {
    const c = mapa.conteos;
    const alcance = e.soloId !== null ? '' : (e.enfocarEjido || e.soloEjido) ? 'Pozos en el ejido de Comodoro'
      : hayFiltros(e) ? 'Pozos con los filtros elegidos' : 'Pozos en la cuenca';
    leyenda.innerHTML = (alcance ? `<p class="ley-titulo">${alcance}</p>` : '')
      + estados.filter((x) => c[x.cod] > 0).map((x) => `<div class="ley-item${e.estadosVisibles.has(x.cod) ? '' : ' apagado'}"><span class="ley-dot" style="background:${x.hex}"></span>${x.nombre}<b>${fmt(c[x.cod])}</b></div>`).join('')
      + (e.concesiones && e.soloId === null ? leyendaSinConcesion(mapa.sinConcesion) : '')
      + (e.poblacion ? leyendaPoblacion() : '');
    for (const x of estados) {
      $(`est-${x.cod}`).checked = e.estadosVisibles.has(x.cod);
      cuentaEstado.get(x.cod).textContent = fmt(c[x.cod]);
    }
    $('f-empresa').value = e.empresa ?? '';
    $('f-yacimiento').value = e.yacimiento ?? '';
    $('f-provincia').value = e.provincia ?? '';
    $('f-sinprod').value = e.sinProducir ?? '';
    $('f-poblacion').checked = e.poblacion;
    $('f-barrios').checked = e.barrios;
    $('f-concesiones').checked = e.concesiones;
    $('f-conc-nota').hidden = !e.concesiones;
    $('f-conc-nota').textContent = `Con anillo: ${fmt(mapa.sinConcesion)} pozos en áreas que no figuran como concesión vigente.`;
    $('n-visible').textContent = fmt(mapa.visibles);
  }
  mapa.alCambiar(sincronizar);
  sincronizar(mapa.estado);

  // ---- buscador por sigla: índice siglas.json; acepta "CH-679" para "YPF.Ch.-679" ----
  const resultados = $('f-resultados');
  $('f-buscar').addEventListener('change', (ev) => buscar(ev.target.value.trim()));
  $('f-buscar').addEventListener('input', (ev) => { if (!ev.target.value.trim()) resultados.innerHTML = ''; });
  resultados.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-id]');
    if (b) abrirPozo(Number(b.dataset.id), { volar: true });
  });

  async function buscar(q) {
    const nq = normalizarSigla(q);
    if (!nq) { resultados.innerHTML = ''; return; }
    resultados.textContent = 'Buscando…';
    let S;
    try { S = await cargarSiglas(); } catch (err) {
      console.error(err);
      resultados.textContent = 'No se pudo cargar el índice de siglas. Revisá tu conexión y probá de nuevo.';
      return;
    }
    // Primero la sigla idéntica, después las que terminan igual ("CH679" → "YPFCH679"), después las que la contienen
    const exactas = [], final = [], contienen = [];
    S.norm.forEach((s, i) => {
      if (s === nq) exactas.push(i);
      else if (s.endsWith(nq)) final.push(i);
      else if (s.includes(nq)) contienen.push(i);
    });
    const hallados = [...exactas, ...final, ...contienen];
    if (!hallados.length) { resultados.textContent = `No encontré ninguna sigla parecida a "${q}".`; return; }
    if (hallados.length === 1) { resultados.innerHTML = ''; abrirPozo(S.id[hallados[0]], { volar: true }); return; }
    const aviso = hallados.length > MAX_RESULTADOS
      ? `${fmt(hallados.length)} pozos coinciden; se muestran los primeros ${MAX_RESULTADOS}.` : `${hallados.length} pozos coinciden:`;
    resultados.innerHTML = `<p class="muted">${aviso}</p><ul class="lista-resultados">${hallados.slice(0, MAX_RESULTADOS).map((i) => {
      const fila = mapa.filaDe(S.id[i]);
      const est = fila === undefined ? '' : ESTADOS[pozos.cols.estado_cod[fila]].nombre;
      const yac = fila === undefined ? '' : meta.yacimientos[pozos.cols.yac_cod[fila]];
      return `<li><button type="button" data-id="${S.id[i]}">${esc(S.s[i])}<span class="muted"> · ${esc(est)}${yac ? ` · ${esc(yac)}` : ''}</span></button></li>`;
    }).join('')}</ul>`;
  }

  // ---- tooltip al pasar sobre un pozo: sigla (si ya está el índice), estado y yacimiento ----
  let indiceSiglas = null;
  function tooltipPozo(idpozo, fila) {
    if (!indiceSiglas) cargarSiglas().then((S) => { indiceSiglas = S; }).catch(() => {});
    const sigla = indiceSiglas?.porId.get(idpozo);
    const est = ESTADOS[pozos.cols.estado_cod[fila]];
    const yac = meta.yacimientos[pozos.cols.yac_cod[fila]];
    return `${sigla ? `<strong>${esc(sigla)}</strong><br>` : ''}<span class="ley-dot" style="background:${est.hex}"></span>${est.nombre}${yac ? `<br><span class="tooltip-sec">${esc(yac)}</span>` : ''}`;
  }

  // ---- ficha: diálogo no modal; toma el foco, Escape la cierra y el foco vuelve a quien la abrió ----
  const ficha = $('ficha');
  let pedido = 0;       // descarta respuestas viejas si se hace clic en otro pozo mientras carga
  let disparador = null;
  async function abrirPozo(idpozo, { volar = false } = {}) {
    const mio = ++pedido;
    if (ficha.classList.contains('hidden')) disparador = document.activeElement;
    if (volar) {
      const c = mapa.coordsDe(idpozo);
      if (c) mapa.volar({ center: c, zoom: Math.max(mapa.map.getZoom(), 14) });
    }
    mapa.aplicar({ resaltado: idpozo });
    let f;
    try { f = await cargarFicha(idpozo); } catch (err) {
      console.error(err);
      f = { error: 'No se pudo cargar la ficha. Revisá tu conexión y probá de nuevo.' };
    }
    if (mio !== pedido) return;
    mostrarFicha(f);
  }
  function mostrarFicha(f) {
    const cerrar = '<button type="button" class="cerrar" aria-label="Cerrar la ficha">×</button>';
    if (!f || f.error) {
      ficha.innerHTML = `${cerrar}<p id="ficha-titulo" class="ficha-error">${esc(f?.error || 'Sin datos para este pozo.')}</p>`;
    } else {
      const e = ESTADOS.find((x) => x.nombre === f.g);
      const anios = f.msp >= 12 ? Math.floor(f.msp / 12) : 0;
      ficha.innerHTML = `
        ${cerrar}
        <p class="kicker" id="ficha-titulo">Pozo ${esc(f.s)}</p>
        <p class="ficha-estado"><span class="ley-dot" style="background:${e?.hex}"></span>${esc(f.est)}</p>
        <dl>
          <dt>Operadora</dt><dd>${f.e ? esc(f.e) : '<em>sin empresa asignada</em>'}</dd>
          ${f.ea && f.ea !== f.e ? `<dt>Operadora anterior</dt><dd>${esc(f.ea)}</dd>` : ''}
          <dt>Yacimiento</dt><dd>${esc(f.y || '—')}</dd>
          <dt>Área / concesión</dt><dd>${esc(f.ar || '—')}</dd>
          <dt>Provincia</dt><dd>${esc(f.p)}</dd>
          <dt>Tipo</dt><dd>${esc(f.tp || '—')} · ${esc(f.c || '')} ${f.sc ? '/ ' + esc(f.sc) : ''}</dd>
          ${f.fperf ? `<dt>Perforado</dt><dd>${esc(f.fperf)}${f.fterm ? ` · terminado ${esc(f.fterm)}` : ''}</dd>` : '<dt>Perforado</dt><dd><em>sin fecha en el registro</em></dd>'}
          ${f.pp ? `<dt>Primera producción</dt><dd>${f.pp06 ? 'ya figuraba en enero de 2006 (inicio de la serie)' : esc(f.pp)}</dd>` : ''}
          ${f.up ? `<dt>Última producción</dt><dd>${esc(f.up)}${anios ? ` · ${anios} ${anios === 1 ? 'año' : 'años'} sin producir` : ''}</dd>` : ''}
          ${declaradoAbandonado(f)}
          ${f.conc === false ? `<dt>Concesión</dt><dd><em>el área no figura como concesión vigente</em></dd>` : ''}
          ${f.prof ? `<dt>Profundidad</dt><dd>${fmt(f.prof)} m</dd>` : ''}
          ${f.ej ? `<dt>Ubicación</dt><dd>${f.b ? `Barrio ${esc(f.b)}, ` : ''}dentro del ejido de Comodoro Rivadavia${f.rp ? ` · radio censal con ${fmt(f.rp)} habitantes` : ''}</dd>` : ''}
        </dl>
        <p class="fuente">Estado declarado por la operadora ante la Secretaría de Energía. No describe el estado físico del pozo.</p>`;
    }
    ficha.classList.remove('hidden');
    ficha.querySelector('.cerrar').addEventListener('click', cerrarFicha);
    ficha.querySelector('.cerrar').focus();
  }
  function cerrarFicha() {
    if (ficha.classList.contains('hidden')) return;
    pedido++;
    ficha.classList.add('hidden');
    mapa.aplicar({ resaltado: null });
    if (disparador && disparador !== document.body && document.contains(disparador)) disparador.focus();
    disparador = null;
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarFicha(); });

  // ---- mostrar/ocultar panel ----
  function mostrarPanel() {
    panel.classList.remove('hidden');
    document.body.classList.remove('sin-leyenda'); // al explorar, la leyenda siempre está
    mapa.habilitarExploracion(true);
    sincronizar(mapa.estado);
    cargarSiglas().then((S) => { indiceSiglas = S; }).catch(() => {}); // para el tooltip y el buscador
  }
  $('btn-recorrido').addEventListener('click', () => {
    panel.classList.add('hidden');
    mapa.habilitarExploracion(false);
    const destino = document.querySelector('#story .step[data-step="1"] .titulo-paso');
    destino.tabIndex = -1;
    destino.focus({ preventScroll: true }); // el foco no se pierde al ocultar el panel
    destino.closest('.step').scrollIntoView({ behavior: reducirMovimiento() ? 'auto' : 'smooth' });
  });

  return { alClickPozo: (idpozo) => abrirPozo(idpozo), tooltipPozo, mostrarPanel };
}

function hayFiltros(e) {
  return e.empresa !== null || e.yacimiento !== null || e.provincia !== null || e.sinProducir !== null
    || ESTADOS.some((x) => !e.estadosVisibles.has(x.cod));
}

function leyendaSinConcesion(n) {
  return `<div class="ley-extra"><div class="ley-item"><span class="ley-anillo"></span>En áreas que no figuran como concesión vigente<b>${fmt(n)}</b></div></div>`;
}

function leyendaPoblacion() {
  const c = CORTES_POBLACION;
  const rotulos = [`menos de ${fmt(c[0])}`, ...c.slice(1).map((v, i) => `${fmt(c[i])} a ${fmt(v)}`), `${fmt(c[c.length - 1])} o más`];
  return `<div class="ley-pobl"><p class="ley-titulo">Habitantes por radio censal</p>${POBLACION_RAMPA.map((hex, i) =>
    `<div class="ley-item"><span class="ley-caja" style="background:${hex}"></span>${rotulos[i]}</div>`).join('')}</div>`;
}

// "Declarado abandonado": la serie mensual arranca en enero de 2017, así que "2017-01" significa
// "ya figuraba abandonado al empezar la serie", no la fecha real. Si el listado de operadoras trae
// la fecha de abandono (pocos pozos, a veces muy viejos), se muestra esa. Solo para pozos que hoy
// figuran abandonados: `pab` es el primer mes en ese estado, aunque después haya cambiado.
function declaradoAbandonado(f) {
  if (f.g !== 'Abandonado') return '';
  if (f.fab) return `<dt>Declarado abandonado</dt><dd>${esc(f.fab)} <em>(listado de operadoras)</em></dd>`;
  if (f.pab === '2017-01') return '<dt>Declarado abandonado</dt><dd>ya figuraba así en enero de 2017 (inicio de la serie mensual)</dd>';
  if (f.pab) return `<dt>Declarado abandonado</dt><dd>desde ${esc(f.pab)}</dd>`;
  return '';
}

function contar(arr, k) {
  const c = new Uint32Array(k);
  for (let i = 0; i < arr.length; i++) c[arr[i]]++;
  return c;
}
function llenarSelect(sel, nombres, conteos, etiqueta, max = 40) {
  const idx = [...nombres.keys()].sort((a, b) => conteos[b] - conteos[a]).slice(0, max);
  for (const i of idx) {
    if (conteos[i] === 0) continue;
    const o = document.createElement('option');
    o.value = i; o.textContent = `${etiqueta(nombres[i])} (${fmt(conteos[i])})`;
    sel.appendChild(o);
  }
}
