// Panel de exploración: filtros, leyenda con conteos, buscador, ficha por pozo y tooltip.
// Los controles no guardan estado propio: se resincronizan con mapa.estado después de cada cambio
// (también cuando el recorrido cambia de paso), así nunca muestran un filtro que no está aplicado.

import { ESTADOS, POBLACION_RAMPA, CORTES_POBLACION } from './paleta.js';
import { cargarFicha, cargarSiglas, normalizarSigla, fmt, esc, mesAnio, TRAMOS_SIN_PRODUCIR, VISTA_CUENCA, paddingPanel } from './data.js';
import { montarUbicacion } from './ubicacion.js';

const MAX_RESULTADOS = 12;

// Filtros de fábrica: así arranca el visualizador la primera vez (con la vista de la cuenca del paso 8, VISTA_CUENCA).
// limites: true = el ejido de Comodoro siempre a la vista en el visualizador.
const estadoInicial = () => ({
  estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, sinProducir: null, barrio: null,
  soloEjido: false, enfocarEjido: false, enfocarZonaNorte: false, poblacion: false, limites: true, pozos: true, pais: false,
  concesiones: false, barrios: false, soloId: null, resaltado: null, satelite: false,
});

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
  const pctEstado = new Map();
  // Barra de estados: la proporción de cada estado en lo que pasa los demás filtros (los mismos conteos de las casillas).
  // Para lectores de pantalla sobra: los números están en las casillas.
  const barraEstados = document.createElement('div');
  barraEstados.className = 'barra-estados';
  barraEstados.setAttribute('aria-hidden', 'true');
  const segmentos = new Map(estados.map((e) => {
    const s = document.createElement('span');
    s.style.background = e.hex;
    barraEstados.appendChild(s);
    return [e.cod, s];
  }));
  fEstado.appendChild(barraEstados);
  for (const e of estados) {
    const id = `est-${e.cod}`;
    const row = document.createElement('div');
    row.className = 'filtro-inline';
    row.innerHTML = `<input type="checkbox" id="${id}" checked><label for="${id}"><span class="ley-dot" style="background:${e.hex}"></span>${e.nombre}<span class="cuenta"></span><span class="pct"></span></label>`;
    row.querySelector('input').addEventListener('change', (ev) => {
      ev.target.checked ? mapa.estado.estadosVisibles.add(e.cod) : mapa.estado.estadosVisibles.delete(e.cod);
      mapa.aplicar();
    });
    cuentaEstado.set(e.cod, row.querySelector('.cuenta'));
    pctEstado.set(e.cod, row.querySelector('.pct'));
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

  // ---- barrio de Comodoro (cols.barrio_cod; meta.barrios, los 77 con o sin pozos): filtra y acerca el mapa al barrio ----
  const nombresBarrios = meta.barrios ?? [];
  const selBarrio = $('f-barrio');
  if (nombresBarrios.length && pozos.cols.barrio_cod) {
    const porBarrio = contar(pozos.cols.barrio_cod, nombresBarrios.length + 1);
    nombresBarrios.map((nombre, k) => ({ nombre, cod: k + 1 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .forEach(({ nombre, cod }) => {
        const o = document.createElement('option');
        o.value = cod;
        o.textContent = `${nombre} (${fmt(porBarrio[cod])})`;
        selBarrio.appendChild(o);
      });
    selBarrio.addEventListener('change', (ev) => {
      const cod = numONull(ev.target.value);
      // con un barrio elegido se prende la capa de barrios, para ver su contorno
      mapa.aplicar(cod === null ? { barrio: null } : { barrio: cod, barrios: true });
      const b = cod !== null && mapa.barrio(nombresBarrios[cod - 1]);
      if (b) mapa.volar({ bounds: b.bounds, maxZoom: 15 }, { padding: paddingPanel() });
    });
  } else {
    selBarrio.closest('.filtro').classList.add('hidden');
  }

  // ---- tiempo sin producir (serie mensual; tramos en data.js): un botón por tramo, con su barra. Tocarlo filtra;
  // tocarlo de nuevo saca el filtro. La barra va en dos tonos: tinta = el resto, gris = ya declarados abandonados.
  const T = resumen.trayectoria;
  let botonesTramo = [];
  const etiquetas = T ? {
    ultimo_anio: 'Produjo en los últimos 12 meses',
    '1_a_5': 'Entre 1 y 5 años sin producir',
    mas_de_5: 'Más de 5 años sin producir',
    nunca: `Ningún mes de producción desde ${T.cobertura.desde.slice(0, 4)}`,
  } : {};
  if (T) {
    const nota = $('f-sinprod-nota');
    botonesTramo = TRAMOS_SIN_PRODUCIR.map((clave, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tramo';
      b.dataset.etiqueta = etiquetas[clave];
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="tramo-fila">${etiquetas[clave]}<span class="cuenta"></span></span><span class="pista" aria-hidden="true"><span class="pista-resto"></span><span class="pista-ab"></span></span>`;
      b.addEventListener('click', () => mapa.aplicar({ sinProducir: mapa.estado.sinProducir === i ? null : i }));
      $('f-sinprod').insertBefore(b, nota);
      return b;
    });
    nota.textContent = `En gris, los que la operadora ya declaró abandonados. Tocá una barra para filtrar el mapa. Según la producción mensual declarada, de ${mesAnio(T.cobertura.desde)} a ${mesAnio(T.cobertura.hasta)}.`;
  } else {
    $('f-sinprod').classList.add('hidden');
  }

  // ---- descargar los pozos que se ven (CSV, UTF-8 con BOM para que Excel lea los acentos): se arma acá con el binario
  // y el índice de siglas, con los mismos filtros del mapa. Sin filtros, son todos los pozos de la cuenca. ----
  const btnCsv = $('btn-csv');
  function csvPozos(filas, S) {
    const { idpozo, lon, lat, estado_cod, empresa_cod, yac_cod, prov_cod, ejido_cod, tramo_sp, barrio_cod } = pozos.cols;
    const campo = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const encabezado = ['idpozo', 'sigla', 'operadora', 'yacimiento', 'provincia', 'estado_declarado_grupo', 'tiempo_sin_producir',
      'en_ejido_comodoro', 'barrio', 'lon', 'lat'];
    const renglones = filas.map((i) => [
      idpozo[i], S.porId.get(idpozo[i]) ?? '', meta.empresas[empresa_cod[i]], meta.yacimientos[yac_cod[i]],
      meta.provincias[prov_cod[i]] ?? '', ESTADOS[estado_cod[i]].nombre, etiquetas[TRAMOS_SIN_PRODUCIR[tramo_sp[i]]] ?? '',
      ejido_cod[i] ? 'sí' : 'no', barrio_cod?.[i] ? nombresBarrios[barrio_cod[i] - 1] : '', lon[i].toFixed(6), lat[i].toFixed(6),
    ].map(campo).join(','));
    return `${[encabezado.join(','), ...renglones].join('\r\n')}\r\n`;
  }
  btnCsv.addEventListener('click', async () => {
    let S;
    try { S = await cargarSiglas(); } catch (err) {
      console.error(err);
      avisar('No se pudo armar el archivo. Revisá tu conexión y probá de nuevo.');
      return;
    }
    const url = URL.createObjectURL(new Blob(['﻿', csvPozos(mapa.filasVisibles(), S)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'pozos-golfo-san-jorge.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('n-total').textContent = fmt(pozos.n);

  // ---- botones sobre el mapa (solo en el visualizador): mapa base y ubicación ----
  const grupoBase = document.createElement('div');
  grupoBase.className = 'maplibregl-ctrl maplibregl-ctrl-group botonera';
  const botonBase = document.createElement('button');
  botonBase.type = 'button';
  botonBase.className = 'boton-base';
  grupoBase.append(botonBase);
  botonBase.addEventListener('click', () => mapa.aplicar({ satelite: !mapa.estado.satelite }));
  mapa.agregarControl(grupoBase);

  const aviso = $('aviso-mapa');
  let temporizadorAviso = null;
  function avisar(texto) {
    aviso.textContent = texto;
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 6000);
  }
  const ubicacion = montarUbicacion({ mapa, avisar });

  // ---- leyenda (recorrido) y controles del panel: se redibujan con cada cambio del mapa ----
  const leyenda = $('leyenda');
  function sincronizar(e) {
    const c = mapa.conteos;
    const alcance = e.soloId !== null ? '' : e.enfocarZonaNorte ? 'Pozos en los barrios de zona norte'
      : (e.enfocarEjido || e.soloEjido) ? 'Pozos en el ejido de Comodoro'
      : hayFiltros(e) ? 'Pozos con los filtros elegidos' : 'Pozos en la cuenca';
    leyenda.innerHTML = (alcance ? `<p class="ley-titulo">${alcance}</p>` : '')
      + estados.filter((x) => c[x.cod] > 0).map((x) => `<div class="ley-item${e.estadosVisibles.has(x.cod) ? '' : ' apagado'}"><span class="ley-dot" style="background:${x.hex}"></span>${x.nombre}<b>${fmt(c[x.cod])}</b></div>`).join('')
      + (e.concesiones && e.soloId === null ? leyendaSinConcesion(mapa.sinConcesion) : '')
      + (e.poblacion ? leyendaPoblacion() : '');
    const suma = estados.reduce((s, x) => s + c[x.cod], 0);
    for (const x of estados) {
      $(`est-${x.cod}`).checked = e.estadosVisibles.has(x.cod);
      cuentaEstado.get(x.cod).textContent = fmt(c[x.cod]);
      pctEstado.get(x.cod).textContent = suma ? pct(c[x.cod], suma) : '';
      const seg = segmentos.get(x.cod);
      seg.style.flexGrow = c[x.cod];
      seg.hidden = c[x.cod] === 0;
      seg.classList.toggle('apagado', !e.estadosVisibles.has(x.cod));
    }
    const ct = mapa.conteosTramo, ab = mapa.tramoAbandonados;
    const mayor = Math.max(1, ...ct);
    botonesTramo.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(e.sinProducir === i));
      b.setAttribute('aria-label', `${b.dataset.etiqueta}: ${fmt(ct[i])} pozos${ab[i] ? `, ${fmt(ab[i])} ya declarados abandonados` : ''}`);
      b.querySelector('.cuenta').textContent = fmt(ct[i]);
      b.querySelector('.pista-resto').style.width = `${((ct[i] - ab[i]) / mayor) * 100}%`;
      b.querySelector('.pista-ab').style.width = `${(ab[i] / mayor) * 100}%`;
    });
    $('f-empresa').value = e.empresa ?? '';
    $('f-yacimiento').value = e.yacimiento ?? '';
    $('f-provincia').value = e.provincia ?? '';
    selBarrio.value = e.barrio ?? '';
    const notaBarrio = $('f-barrio-nota');
    const pb = e.barrio !== null ? mapa.barrio(nombresBarrios[e.barrio - 1])?.props : null;
    notaBarrio.hidden = !pb;
    // población del Censo 2022 por barrio, con las mismas salvedades que el cartel de barrio (cartelArea)
    if (pb) {
      notaBarrio.textContent = pb.pobl == null ? 'Sin dato de población por barrio.'
        : pb.pobl_con ? `${fmt(pb.pobl)} habitantes entre este barrio y ${pb.pobl_con} (el Censo 2022 los cuenta juntos).`
          : `${fmt(pb.pobl)} habitantes (Censo 2022).`;
    }
    btnCsv.hidden = mapa.visibles === 0;
    btnCsv.textContent = `Descargar ${mapa.visibles === 1 ? 'este pozo' : `estos ${fmt(mapa.visibles)} pozos`} (CSV)`;
    $('f-poblacion').checked = e.poblacion;
    $('f-barrios').checked = e.barrios;
    $('f-concesiones').checked = e.concesiones;
    $('f-conc-nota').hidden = !e.concesiones;
    $('f-conc-nota').textContent = `Con anillo: ${fmt(mapa.sinConcesion)} pozos en áreas que no figuran como concesión vigente.`;
    $('n-visible').textContent = fmt(mapa.visibles);
    botonBase.textContent = e.satelite ? 'Mapa' : 'Satélite';
    botonBase.title = e.satelite ? 'Volver al mapa' : 'Ver imagen satelital';
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

  // ---- cartel al tocar un radio censal, un barrio o una concesión (el pozo tiene prioridad: ver map.js) ----
  function cartelArea(tipo, p, extra = {}) {
    const n = (x, uno, varios) => `${fmt(x)} ${x === 1 ? uno : varios}`;
    const pozosTxt = p.pozos ? `${n(p.pozos, 'pozo', 'pozos')}${p.abandonados ? `, ${n(p.abandonados, 'abandonado', 'abandonados')}` : ''}` : 'Sin pozos';
    if (tipo === 'radio') return `<p class="cartel-titulo">Radio censal</p>${extra.barrio ? `<p>Barrio ${esc(extra.barrio)}</p>` : ''}<p><b>${fmt(p.pobl)}</b> habitantes (Censo 2022)</p><p>${pozosTxt}</p>`;
    if (tipo === 'concesion') {
      // nombre y operadora tal cual la capa de concesiones de la Secretaría de Energía; pozos por código de área (procesar.py)
      const pozosArea = p.pozos ? `${n(p.pozos, 'pozo', 'pozos')}${p.sin_producir ? `, ${fmt(p.sin_producir)} sin producir` : ''}` : 'Sin pozos en el registro';
      return `<p class="cartel-titulo">Concesión ${esc(p.nombre)}</p>${p.operadora ? `<p>Operadora: ${esc(p.operadora)}</p>` : ''}<p>${pozosArea}</p>`;
    }
    // pobl_con: el Censo por barrio cuenta este barrio junto con otro (un solo renglón para los dos)
    const pobl = p.pobl == null ? '<p>Sin dato de población por barrio</p>'
      : p.pobl_con ? `<p><b>${fmt(p.pobl)}</b> habitantes entre este barrio y ${esc(p.pobl_con)} (el Censo 2022 los cuenta juntos)</p>`
        : `<p><b>${fmt(p.pobl)}</b> habitantes (Censo 2022)</p>`;
    return `<p class="cartel-titulo">Barrio ${esc(p.barrio)}</p>${pobl}<p>${pozosTxt}</p>`;
  }

  // ---- ficha: diálogo no modal; toma el foco, Escape la cierra y el foco vuelve a quien la abrió ----
  const ficha = $('ficha');
  let pedido = 0;       // descarta respuestas viejas si se hace clic en otro pozo mientras carga
  let disparador = null;
  let fichaAbierta = null; // idpozo de la ficha visible (se recupera al volver al visualizador)
  async function abrirPozo(idpozo, { volar = false, foco = true } = {}) {
    const mio = ++pedido;
    fichaAbierta = idpozo;
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
    mostrarFicha(f, foco);
  }
  function mostrarFicha(f, foco = true) {
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
          ${f.up ? `<dt>Última producción</dt><dd>${esc(f.up)}${anios ? ` · ${f.ud ? 'al menos ' : ''}${anios} ${anios === 1 ? 'año' : 'años'} sin producir` : ''}</dd>` : ''}
          ${f.ud ? `<dt>Declaración mensual</dt><dd>hasta ${mesAnio(f.ud)}; después la operadora no lo declara</dd>` : ''}
          ${declaradoAbandonado(f, resumen.trayectoria?.cobertura.desde)}
          ${f.conc === false ? `<dt>Concesión</dt><dd><em>el área no figura como concesión vigente</em></dd>` : ''}
          ${f.prof ? `<dt>Profundidad</dt><dd>${fmt(f.prof)} m</dd>` : ''}
          ${f.ej ? `<dt>Ubicación</dt><dd>${f.b ? `Barrio ${esc(f.b)}, ` : ''}dentro del ejido de Comodoro Rivadavia${f.rp ? ` · radio censal con ${fmt(f.rp)} habitantes` : ''}</dd>` : ''}
        </dl>
        <p class="fuente">Estado declarado por la operadora ante la Secretaría de Energía. No describe el estado físico del pozo.</p>`;
    }
    ficha.classList.remove('hidden');
    ficha.querySelector('.cerrar').addEventListener('click', () => cerrarFicha());
    if (foco) ficha.querySelector('.cerrar').focus();
  }
  function cerrarFicha({ devolverFoco = true } = {}) {
    if (ficha.classList.contains('hidden')) return;
    pedido++;
    fichaAbierta = null;
    ficha.classList.add('hidden');
    mapa.aplicar({ resaltado: null });
    if (devolverFoco && disparador && disparador !== document.body && document.contains(disparador)) disparador.focus();
    disparador = null;
  }
  // Escape cierra la ficha (salvo con la ventana de Metodología abierta: ahí Escape es de la ventana)
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !document.querySelector('.ventana[open]')) cerrarFicha(); });

  // ---- mostrar/ocultar panel ----
  // En celular el panel se pliega a su encabezado para ver el mapa entero (en escritorio el botón no se ve).
  const plegar = $('btn-plegar');
  function plegarPanel(plegado) {
    panel.classList.toggle('plegado', plegado);
    plegar.setAttribute('aria-expanded', String(!plegado));
    plegar.textContent = plegado ? 'Mostrar filtros' : 'Ocultar filtros';
  }
  plegar.addEventListener('click', () => plegarPanel(!panel.classList.contains('plegado')));

  // ---- entrar y salir del visualizador (avisa src/navegacion.js) ----
  // Al salir se guarda cómo quedó (filtros, vista y ficha) para recuperarlo al volver en la misma visita.
  let guardado = null;
  function entrar() {
    panel.classList.remove('hidden', 'cargando');
    plegarPanel(false);
    mapa.habilitarExploracion(true);
    mapa.marcador(null);
    mapa.historias(null); // los marcadores de historias son del recorrido (tarjeta 7)
    if (guardado) {
      mapa.aplicar(guardado.estado);
      mapa.irA(guardado.vista);
      if (guardado.ficha !== null) abrirPozo(guardado.ficha, { foco: false });
    } else {
      mapa.aplicar(estadoInicial());
      if (document.querySelector('#story .step.activa[data-cierre-listo]')) {
        // Desde el final del recorrido, con su vuelo terminado, el mapa ya muestra la cuenca: no se mueve. En el celular el
        // panel arranca plegado, así se ve lo mismo que en la tarjeta (abierto taparía el sur de la cuenca).
        if (window.matchMedia('(max-width: 700px)').matches) plegarPanel(true);
      } else {
        // La cuenca en lo que queda libre del mapa: a la izquierda del panel (computadora) o arriba de él (celular).
        mapa.volar(VISTA_CUENCA, { padding: paddingPanel() });
      }
    }
    $('explore-titulo').focus({ preventScroll: true });
    cargarSiglas().then((S) => { indiceSiglas = S; }).catch(() => {}); // para el tooltip y el buscador
  }
  function salir() {
    guardado = { estado: { ...mapa.estado, estadosVisibles: new Set(mapa.estado.estadosVisibles) }, vista: mapa.vista(), ficha: fichaAbierta };
    ubicacion.apagar();
    cerrarFicha({ devolverFoco: false });
    panel.classList.add('hidden');
    mapa.habilitarExploracion(false);
  }

  return { alClickPozo: (idpozo) => abrirPozo(idpozo), tooltipPozo, cartelArea, entrar, salir };
}

function hayFiltros(e) {
  return e.empresa !== null || e.yacimiento !== null || e.provincia !== null || e.sinProducir !== null || e.barrio !== null
    || ESTADOS.some((x) => !e.estadosVisibles.has(x.cod));
}

/** Porcentaje entero para el panel («36 %»); los extremos no se redondean a 0 ni a 100. */
function pct(n, total) {
  const p = (n * 100) / total;
  if (n === 0) return '0 %';
  if (p < 1) return '<1 %';
  if (p > 99 && n < total) return '>99 %';
  return `${Math.round(p)} %`;
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

// "Declarado abandonado": si `pab` es el primer mes de la serie mensual (`desde`, hoy "2011-01"), significa
// "ya figuraba abandonado al empezar la serie", no la fecha real. Si el listado de operadoras trae
// la fecha de abandono (pocos pozos, a veces muy viejos), se muestra esa. Solo para pozos que hoy
// figuran abandonados: `pab` es el primer mes en ese estado, aunque después haya cambiado.
function declaradoAbandonado(f, desde) {
  if (f.g !== 'Abandonado') return '';
  if (f.fab) return `<dt>Declarado abandonado</dt><dd>${esc(f.fab)} <em>(listado de operadoras)</em></dd>`;
  if (desde && f.pab === desde) return `<dt>Declarado abandonado</dt><dd>ya figuraba así en ${mesAnio(desde)} (inicio de la serie mensual)</dd>`;
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
