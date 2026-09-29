// Mapa: MapLibre GL como base + deck.gl (MapboxOverlay) para los pozos y los polígonos.
// Un solo ScatterplotLayer con los 44.390 pozos; los filtros se aplican en GPU
// con DataFilterExtension, así cambiar de estado/operadora no reconstruye nada.
//
// Carga en dos tiempos (plan 3.4): este módulo trae solo MapLibre, así la portada tiene su mapa base enseguida.
// deck.gl (~60 % del JavaScript) se importa aparte cuando llegan los pozos (cargarCapas) y el país al final
// (agregarPais). Mientras tanto aplicar(), volar() y marcador() funcionan: guardan el estado y se ponen al día.

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ESTADOS, PALETA, POBLACION_RAMPA, CORTES_POBLACION } from './paleta.js';
import { esc, reducirMovimiento, paddingPanel } from './data.js';

// Mapa base. Por defecto, OpenFreeMap (vectorial, gratuito, sin clave) con los rótulos forzados al
// nombre en castellano de OpenStreetMap (`name:es`): así dice "Islas Malvinas" y no "Falklands".
// Probado el 20/09/2026. Alternativa: Argenmap del Instituto Geográfico Nacional (cartografía oficial,
// raster); se desatura para el estilo papel. Ese día el servidor del IGN no respondía, por eso no es
// el predeterminado: con MAPA_BASE = 'ign' se prueba un tile y, si no llega en 5 s, se usa OpenFreeMap.
const MAPA_BASE = 'openfreemap'; // 'openfreemap' | 'ign'

const ESTILO_OPENFREEMAP = 'https://tiles.openfreemap.org/styles/positron';
const TILE_PRUEBA_IGN = 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/7/44/43.png';

const ESTILO_IGN = {
  version: 8,
  sources: {
    argenmap: {
      type: 'raster',
      tiles: ['https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png'],
      tileSize: 256,
      scheme: 'tms',
      maxzoom: 18,
      attribution: '© <a href="https://www.ign.gob.ar/">Instituto Geográfico Nacional</a> (Argenmap)',
    },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': PALETA.fondo } },
    { id: 'argenmap', type: 'raster', source: 'argenmap',
      paint: { 'raster-saturation': -1, 'raster-opacity': 0.55, 'raster-contrast': -0.15, 'raster-brightness-min': 0.1 } },
  ],
};

// Estilo mínimo local: fondo papel sin tiles. Se usa mientras carga el remoto y como respaldo
// si el proveedor no responde (la pieza sigue funcionando: los pozos y los límites son nuestros).
const ESTILO_RESPALDO = {
  version: 8,
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': PALETA.fondo } }],
};

// Imagen satelital del visualizador: Esri World Imagery, sin clave, con la atribución que usan los autores en otras
// iniciativas (docs/specs/2026-09-27-satelite-y-ubicacion-design.md). Solo figura en los créditos mientras se ve.
const FUENTE_SATELITE = {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  maxzoom: 19,
  attribution: 'Imagen satelital © Esri — Esri, Vantor, Earthstar Geographics y la comunidad de usuarios GIS',
};
// La ubicación cuenta como "dentro de la cuenca" si cae en el rectángulo de los pozos más este margen (grados).
const MARGEN_CUENCA = 0.25;
// Sobre la imagen satelital: borde blanco de los pozos y anillos claros (forma, no color).
const BLANCO = [255, 255, 255];
const ANILLO_CLARO = [255, 255, 255, 150];

const VISTA_INICIAL = { center: [-66.5, -41.5], zoom: 4.3 }; // la de la portada: el país, sin pozos

// Textos de los controles de MapLibre en castellano (los leen los lectores de pantalla y los avisos de gestos).
const LOCALE = {
  'Map.Title': 'Mapa de pozos',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'NavigationControl.ResetBearing': 'Volver al norte',
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar los créditos del mapa',
  'AttributionControl.MapFeedback': 'Comentarios sobre el mapa',
  'Marker.Title': 'Marcador',
  'Popup.Close': 'Cerrar',
};

// Gestos del mapa que se prenden solo al explorar (ver habilitarExploracion).
const GESTOS = ['scrollZoom', 'dragPan', 'touchZoomRotate', 'doubleClickZoom', 'keyboard'];

// deck.gl, importado a demanda (un chunk aparte). Las extensiones se crean una sola vez: deck.gl compila un
// shader por combinación.
let deck = null;
let deckCargando = null;
function cargarDeck() {
  deckCargando ??= Promise.all([import('@deck.gl/mapbox'), import('@deck.gl/layers'), import('@deck.gl/extensions')])
    .then(([{ MapboxOverlay }, { ScatterplotLayer, GeoJsonLayer }, { DataFilterExtension, PathStyleExtension }]) => ({
      MapboxOverlay, ScatterplotLayer, GeoJsonLayer,
      FILTRO: new DataFilterExtension({ filterSize: 1 }),
      PUNTEADO: new PathStyleExtension({ dash: true }),
    }));
  return deckCargando;
}
/** Empieza a bajar deck.gl sin esperar a los datos (main.js lo llama apenas crea el mapa). */
export const precargarDeck = () => cargarDeck();

// Opacidad de los pozos fuera del ejido cuando se enfoca la ciudad (paso Ejido): se ven, pero atrás.
const ALFA_ATENUADO = 45;

// ¿Responde el IGN? Carga un tile como imagen (no necesita CORS) con tiempo límite.
function ignDisponible(ms = 5000) {
  return new Promise((resolver) => {
    const img = new Image();
    const t = setTimeout(() => resolver(false), ms);
    img.onload = () => { clearTimeout(t); resolver(true); };
    img.onerror = () => { clearTimeout(t); resolver(false); };
    img.src = TILE_PRUEBA_IGN;
  });
}

// Ajustes al estilo Positron de OpenFreeMap:
// 1) Rótulos en castellano: usa `name_en` primero (de ahí "Falklands"); se reemplaza el texto de todas
//    las capas de nombres por `name:es` y, si no existe, `name`.
// 2) Sin áreas protegidas: la capa "park" de OpenStreetMap (parques nacionales, reservas, Península Valdés,
//    Meseta de Somuncurá) dibuja manchones grises que distraen del dato. Se quita.
function prepararEstilo(estilo) {
  const antes = estilo.layers.length;
  estilo.layers = estilo.layers.filter((capa) => capa['source-layer'] !== 'park' && !/^park/.test(capa.id));
  console.info(`Mapa base: ${antes - estilo.layers.length} capas de áreas protegidas quitadas.`);
  for (const capa of estilo.layers) {
    const campo = capa.layout?.['text-field'];
    if (capa.type !== 'symbol' || !campo) continue;
    if (JSON.stringify(campo).includes('"ref"')) continue; // números de ruta: se dejan
    capa.layout['text-field'] = ['coalesce', ['get', 'name:es'], ['get', 'name']];
  }
  return estilo;
}

async function cargarEstiloRemoto(map) {
  if (MAPA_BASE === 'ign' && await ignDisponible()) {
    map.setStyle(ESTILO_IGN);
    return;
  }
  if (MAPA_BASE === 'ign') console.warn('Argenmap (IGN) no responde; se usa OpenFreeMap.');
  try {
    const r = await fetch(ESTILO_OPENFREEMAP);
    if (!r.ok) throw new Error(r.status);
    map.setStyle(prepararEstilo(await r.json()));
  } catch (e) {
    console.warn('Mapa base externo no disponible; se usa el fondo local.', e);
  }
}

export function crearMapa({ onClickPozo, tooltipPozo, cartelArea }) {
  const map = new maplibregl.Map({
    container: 'map',
    style: ESTILO_RESPALDO,
    center: VISTA_INICIAL.center,
    zoom: VISTA_INICIAL.zoom,
    attributionControl: { compact: true },
    locale: LOCALE,
    // Durante el recorrido el mapa no toma gestos: la rueda y el dedo (en el celular) desplazan el texto.
    // Al explorar se prenden todos (ver habilitarExploracion).
    scrollZoom: false, dragPan: false, dragRotate: false, touchZoomRotate: false, touchPitch: false,
    doubleClickZoom: false, keyboard: false, boxZoom: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  // ---- estado de filtros (todo en memoria) ----
  const estado = {
    estadosVisibles: new Set([0, 1, 2, 3, 4]),
    empresa: null,     // código o null
    yacimiento: null,  // código o null
    provincia: null,   // 1 | 2 | null
    sinProducir: null, // tramo de tiempo sin producir (cols.tramo_sp, ver data.js) o null
    soloEjido: false,
    enfocarEjido: false, // se ve toda la cuenca, pero los pozos fuera del ejido quedan atenuados (paso Ejido)
    enfocarZonaNorte: false, // igual con los barrios de zona norte, que además se dibujan (paso Zona norte)
    poblacion: false,
    limites: false,
    pozos: false,      // si es false no se dibuja ningún pozo (portada)
    pais: false,       // capa de todo el país (paso País)
    concesiones: false,
    barrios: false,
    soloId: null,      // idpozo: si está definido, se ve solo ese pozo (paso del Pozo N° 2)
    resaltado: null,   // idpozo resaltado con un anillo (el de la ficha abierta)
    satelite: false,   // imagen satelital de fondo (solo en el visualizador)
  };

  // ---- datos: llegan después del mapa base (cargarCapas, agregarPais) ----
  let pozos = null, pais = null, radios = null, limites = null, concesiones = null, barrios = null;
  let overlay = null; // deck.gl: existe desde que llegan los pozos

  const colorEstado = ESTADOS.map((e) => e.rgb);

  // Colores RGBA por pozo, calculados en CPU una vez. Solo se repintan cuando cambia el enfoque del ejido.
  let colores;
  function pintarPozos() {
    const { estado_cod } = pozos.cols;
    for (let i = 0, j = 0; i < pozos.n; i++, j += 4) {
      const c = colorEstado[estado_cod[i]];
      colores[j] = c[0]; colores[j + 1] = c[1]; colores[j + 2] = c[2];
      colores[j + 3] = enFoco(i) ? 255 : ALFA_ATENUADO;
    }
  }
  /** Fuera del foco (ejido o zona norte, si el paso enfoca uno) el pozo se ve atenuado y no se cuenta. */
  function enFoco(i) {
    const { ejido_cod, zn_cod } = pozos.cols;
    return (!estado.enfocarEjido || ejido_cod[i] === 1) && (!estado.enfocarZonaNorte || zn_cod?.[i] === 1);
  }

  // Vector de "pasa el filtro" recalculado en CPU cuando cambia un filtro (44k valores: instantáneo);
  // DataFilterExtension lo usa en GPU. De paso cuenta, por estado, los pozos que pasan los demás filtros:
  // son los números de la leyenda y del panel (así un estado desmarcado muestra cuántos agregaría).
  let pasa, pasaSinConcesion; // el segundo: visibles y en un área sin concesión vigente (anillo)
  const conteos = new Uint32Array(ESTADOS.length);
  let sinConcesion = 0;
  function recalcularFiltro() {
    const { estado_cod, empresa_cod, yac_cod, prov_cod, ejido_cod, idpozo, tramo_sp, conc_cod } = pozos.cols;
    const { soloId, estadosVisibles, empresa, yacimiento, provincia, sinProducir, soloEjido } = estado;
    conteos.fill(0);
    sinConcesion = 0;
    let n = 0;
    for (let i = 0; i < pozos.n; i++) {
      let resto;
      if (soloId !== null) resto = idpozo[i] === soloId;
      else {
        resto = (empresa === null || empresa_cod[i] === empresa)
          && (yacimiento === null || yac_cod[i] === yacimiento)
          && (provincia === null || prov_cod[i] === provincia)
          && (sinProducir === null || tramo_sp[i] === sinProducir)
          && (!soloEjido || ejido_cod[i] === 1);
      }
      const ok = resto && (soloId !== null || estadosVisibles.has(estado_cod[i]));
      pasa[i] = ok ? 1 : 0;
      const sinConc = ok && conc_cod !== undefined && conc_cod[i] === 0;
      pasaSinConcesion[i] = sinConc ? 1 : 0;
      if (sinConc) sinConcesion++;
      const destacado = enFoco(i);
      if (resto && destacado) conteos[estado_cod[i]]++;
      if (ok && destacado) n++;
    }
    return n;
  }

  // Datos binarios del ScatterplotLayer. deck.gl vuelve a subir un atributo solo si cambia el objeto
  // envoltorio ({ value, size }), así que posiciones y colores quedan fijos y el filtro se renueva al cambiar.
  let attrPosicion, attrColor, datosPozos, datosSinConcesion;
  const armarDatosPozos = () => {
    datosPozos = { length: pozos.n, attributes: { getPosition: attrPosicion, getFillColor: attrColor, getFilterValue: { value: pasa, size: 1 } } };
    datosSinConcesion = { length: pozos.n, attributes: { getPosition: attrPosicion, getFilterValue: { value: pasaSinConcesion, size: 1 } } };
  };
  let visibles = 0;

  function capaPozos() {
    return new deck.ScatterplotLayer({
      id: 'pozos',
      data: datosPozos,
      getRadius: 18,
      radiusMinPixels: 1.6,
      radiusMaxPixels: 7,
      radiusUnits: 'meters',
      stroked: estado.satelite, // sobre la imagen satelital, borde blanco fino
      getLineColor: BLANCO,
      getLineWidth: 0.8,
      lineWidthUnits: 'pixels',
      pickable: true,
      opacity: 0.9 * fundido,
      visible: estado.pozos && !estado.pais, // con la capa país encendida, los puntos de la cuenca los dibuja esa capa
      filterRange: [0.5, 1.5],
      extensions: [deck.FILTRO],
      // true = clic atendido: el onClick general del overlay (carteles de áreas) no se llama. Un solo pick por clic.
      onClick: ({ index }) => {
        if (index < 0) return false;
        cerrarCartel();
        onClickPozo?.(pozos.cols.idpozo[index], index);
        return true;
      },
    });
  }

  // País entero: puntos chicos y tenues; los del Golfo San Jorge un poco más presentes. Colores fijos.
  // Llega último (solo lo usa el paso País): hasta entonces, ese paso muestra el mapa base.
  let datosPais = null;
  function prepararPais() {
    const c = new Uint8Array(pais.n * 4);
    const gris = hexARgb(PALETA.limite);
    for (let i = 0, j = 0; i < pais.n; i++, j += 4) {
      const gsj = pais.cols.gsj_cod[i];
      const rgb = gsj ? colorEstado[pais.cols.estado_cod[i]] : gris;
      c[j] = rgb[0]; c[j + 1] = rgb[1]; c[j + 2] = rgb[2]; c[j + 3] = gsj ? 200 : 90;
    }
    datosPais = { length: pais.n, attributes: { getPosition: { value: pais.positions, size: 2 }, getFillColor: { value: c, size: 4, normalized: true } } };
  }
  function capaPais() {
    if (!datosPais) return null;
    return new deck.ScatterplotLayer({
      id: 'pais',
      visible: estado.pozos && estado.pais,
      opacity: fundido,
      data: datosPais,
      getRadius: 400,
      radiusMinPixels: 1,
      radiusMaxPixels: 3,
      radiusUnits: 'meters',
      stroked: false,
      pickable: false,
    });
  }

  // Con la capa de concesiones encendida: anillo fino en los pozos cuya área no figura como concesión vigente
  // (plan 2.10). Forma, no color, como el resaltado: el relleno sigue siendo el del estado.
  const anilloSinConcesion = [...hexARgb(PALETA.texto), 90]; // tenue: donde hay cientos juntos no debe volverse una mancha
  function capaSinConcesion() {
    return new deck.ScatterplotLayer({
      id: 'sin-concesion',
      data: datosSinConcesion,
      visible: estado.concesiones && estado.pozos && !estado.pais && estado.soloId === null,
      getRadius: 45, // un poco más que el punto (18 m) y con los mismos topes en píxeles, así acompaña el zoom
      radiusUnits: 'meters',
      radiusMinPixels: 2.6,
      radiusMaxPixels: 9,
      filled: false,
      stroked: true,
      getLineColor: estado.satelite ? ANILLO_CLARO : anilloSinConcesion,
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      opacity: fundido,
      pickable: false,
      filterRange: [0.5, 1.5],
      extensions: [deck.FILTRO],
    });
  }

  // Anillo alrededor del pozo de la ficha abierta (forma, no color: no compite con la regla color = estado).
  const anilloTexto = hexARgb(PALETA.texto);
  let datosResaltado = [];
  function capaResaltado() {
    return new deck.ScatterplotLayer({
      id: 'resaltado',
      data: datosResaltado,
      visible: estado.pozos && datosResaltado.length > 0,
      getPosition: (d) => d,
      getRadius: 9,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: estado.satelite ? BLANCO : anilloTexto,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      pickable: false,
    });
  }

  // Ubicación de la persona (botón del visualizador): círculo de precisión tenue y punto negro con borde blanco
  // (no se confunde con el azul de "Activo").
  let datosUbicacion = [];
  function capasUbicacion() {
    if (!datosUbicacion.length) return [];
    return [
      new deck.ScatterplotLayer({
        id: 'ubicacion-precision', data: datosUbicacion, getPosition: (d) => [d.lng, d.lat], getRadius: (d) => d.precision,
        radiusUnits: 'meters', getFillColor: [23, 24, 27, 28], stroked: true, getLineColor: [23, 24, 27, 90],
        getLineWidth: 1, lineWidthUnits: 'pixels', pickable: false,
      }),
      new deck.ScatterplotLayer({
        id: 'ubicacion', data: datosUbicacion, getPosition: (d) => [d.lng, d.lat], getRadius: 7, radiusUnits: 'pixels',
        getFillColor: [23, 24, 27], stroked: true, getLineColor: BLANCO, getLineWidth: 2.5, lineWidthUnits: 'pixels', pickable: false,
      }),
    ];
  }

  // Rectángulo de la cuenca (pozos + margen), para saber si la ubicación cae adentro. Se calcula una vez.
  let rectanguloCuenca = null;
  function limitesCuenca() {
    if (!rectanguloCuenca && pozos) {
      let oeste = 180, sur = 90, este = -180, norte = -90;
      const p = pozos.positions;
      for (let i = 0; i < p.length; i += 2) {
        oeste = Math.min(oeste, p[i]); este = Math.max(este, p[i]);
        sur = Math.min(sur, p[i + 1]); norte = Math.max(norte, p[i + 1]);
      }
      rectanguloCuenca = [oeste - MARGEN_CUENCA, sur - MARGEN_CUENCA, este + MARGEN_CUENCA, norte + MARGEN_CUENCA];
    }
    return rectanguloCuenca ?? [-180, -90, 180, 90];
  }

  // Polígonos: sin picking (no tienen ficha); si no, con pickingRadius le robarían el clic a los pozos.
  function capaConcesiones() {
    if (!concesiones) return null;
    return new deck.GeoJsonLayer({
      id: 'concesiones',
      data: concesiones,
      visible: estado.concesiones,
      filled: true,
      stroked: true,
      // Con una concesión elegida (cartel del visualizador), las demás bajan de intensidad.
      getFillColor: (f) => (atenuada('concesion', f) ? [31, 95, 168, 6] : [31, 95, 168, 18]),
      getLineColor: (f) => (atenuada('concesion', f) ? [31, 95, 168, 50] : [31, 95, 168, 160]),
      lineWidthMinPixels: 1,
      updateTriggers: { getFillColor: seleccion, getLineColor: seleccion },
      pickable: false,
    });
  }

  const colorLimite = hexARgb(PALETA.limite);
  const colorTexto = hexARgb(PALETA.texto);
  function capaBarrios() {
    if (!barrios) return null;
    return new deck.GeoJsonLayer({
      id: 'barrios',
      data: barrios,
      visible: estado.barrios || estado.enfocarZonaNorte,
      filled: false,
      stroked: true,
      // Con zona norte enfocada se dibujan solo sus barrios (propiedad zn), con trazo más grueso. En el visualizador van
      // en negro (el color del texto) para que se lean también sobre la imagen satelital.
      getLineColor: (f) => (estado.enfocarZonaNorte && !f.properties.zn ? [0, 0, 0, 0] : explorando ? colorTexto : colorLimite),
      lineWidthMinPixels: estado.enfocarZonaNorte ? 1.6 : explorando ? 1.5 : 0.8,
      updateTriggers: { getLineColor: [estado.enfocarZonaNorte, explorando] },
      pickable: false,
    });
  }

  const rampa = POBLACION_RAMPA.map(hexARgb);
  function colorPoblacion(p) {
    // cortes fijos de población por radio (CORTES_POBLACION, en paleta.js); la leyenda usa los mismos
    if (p <= 0) return [0, 0, 0, 0];
    const tramo = CORTES_POBLACION.findIndex((c) => p < c);
    return [...rampa[tramo === -1 ? CORTES_POBLACION.length : tramo], 190];
  }

  function capaRadios() {
    if (!radios) return null;
    return new deck.GeoJsonLayer({
      id: 'radios',
      data: radios,
      visible: estado.poblacion,
      filled: true,
      stroked: true,
      // Con un radio elegido (cartel del visualizador), los demás bajan de intensidad y ese queda con su color.
      getFillColor: (f) => {
        const c = colorPoblacion(f.properties.pobl);
        return atenuada('radio', f) && c[3] ? [c[0], c[1], c[2], 80] : c;
      },
      getLineColor: hexARgb(PALETA.urbanoBorde),
      lineWidthMinPixels: 0.5,
      updateTriggers: { getFillColor: seleccion },
      pickable: false,
    });
  }

  function capaLimites() {
    if (!limites) return null;
    return new deck.GeoJsonLayer({
      id: 'limites',
      data: limites,
      visible: estado.limites,
      filled: false,
      stroked: true,
      getLineColor: explorando ? colorTexto : colorLimite, // en el visualizador, negro (se lee sobre el satélite)
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      getDashArray: [6, 4],
      dashJustified: true,
      extensions: [deck.PUNTEADO],
    });
  }

  // Fundido de entrada de los puntos: cuando se pasa de "un solo pozo" a muchos (paso del Pozo N° 2 → país),
  // los puntos aparecen en medio segundo en vez de golpe. Solo cambia la opacidad de las capas de puntos.
  let fundido = 1;
  let animFundido = null;
  function fundirEntrada(ms = 600) {
    cancelAnimationFrame(animFundido);
    if (reducirMovimiento()) { fundido = 1; render(); return; }
    const t0 = performance.now();
    const paso = (t) => {
      fundido = Math.min(1, (t - t0) / ms);
      render();
      if (fundido < 1) animFundido = requestAnimationFrame(paso);
    };
    fundido = 0;
    animFundido = requestAnimationFrame(paso);
  }

  // Marcador del Pozo N° 2 (HTML, así tiene forma propia). El color del borde es el de su estado
  // declarado (Abandonado): el ícono agrega forma, no cambia la regla color = estado.
  // Si se pide antes de que lleguen los pozos, queda pendiente y se pone cuando llegan.
  let marcador = null;
  let marcadorPendiente = null;
  // ---- historias (tarjeta 7): pozos marcados con el ícono del Pozo N° 2 (botones; el título aparece con el mouse o el
  // foco). Al tocarlos se avisa a story.js, que abre la ventana de la historia. ----
  let marcasHistoria = [];
  let historiasPendientes = null; // si llegan antes que los pozos
  let alTocarHistoriaFn = null;
  const ICONO_POZO = `<svg width="16" height="18" viewBox="0 0 18 20" fill="none" stroke="currentColor" stroke-width="1.4"
    stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    <path d="M9 1 L4 19 M9 1 L14 19 M7.3 6.5 L10.7 6.5 M6.2 11 L11.8 11 M5.2 15 L12.8 15 M2 19 L16 19"/></svg>`;
  function mostrarHistorias(lista) {
    for (const m of marcasHistoria) m?.remove();
    marcasHistoria = [];
    historiasPendientes = null;
    if (!lista) return;
    if (!pozos) { historiasPendientes = lista; return; }
    lista.forEach(({ idpozo, etiqueta }, i) => {
      const c = coordsDe(idpozo);
      if (!c) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'marcador-pozo marcador-historia';
      el.innerHTML = `<span class="marcador-halo"></span><span class="marcador-icono">${ICONO_POZO}</span>
        <span class="marcador-etiqueta" aria-hidden="true">${esc(etiqueta)}</span>`;
      el.setAttribute('aria-label', etiqueta);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); alTocarHistoriaFn?.(i); });
      marcasHistoria[i] = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
    });
  }
  /** Marca (o desmarca, con null) el pozo de la historia abierta. */
  function resaltarHistoria(i) { marcasHistoria.forEach((x, j) => x?.getElement().classList.toggle('activa', j === i)); }

  function mostrarMarcador(idpozo, etiqueta) {
    marcador?.remove();
    marcador = null;
    marcadorPendiente = null;
    if (idpozo === null || idpozo === undefined) return;
    if (!pozos) { marcadorPendiente = [idpozo, etiqueta]; return; }
    const c = coordsDe(idpozo);
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'marcador-pozo';
    el.innerHTML = `<span class="marcador-halo"></span><span class="marcador-icono">
      <svg width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="currentColor" stroke-width="1.4"
        stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
        <path d="M9 1 L4 19 M9 1 L14 19 M7.3 6.5 L10.7 6.5 M6.2 11 L11.8 11 M5.2 15 L12.8 15 M2 19 L16 19"/></svg></span>
      <span class="marcador-etiqueta">${esc(etiqueta)}</span>`;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', etiqueta);
    marcador = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
  }

  function coordsDe(idpozo) {
    const i = pozos?.filaPorId.get(idpozo);
    return i === undefined ? null : [pozos.positions[i * 2], pozos.positions[i * 2 + 1]];
  }

  // Radio censal o barrio elegido con un clic en el visualizador: borde negro grueso, debajo de los pozos.
  function capaSeleccion() {
    if (!seleccion) return null;
    return new deck.GeoJsonLayer({
      id: 'seleccion',
      data: [seleccion.feature],
      filled: false,
      stroked: true,
      getLineColor: colorTexto,
      getLineWidth: 3,
      lineWidthUnits: 'pixels',
      pickable: false,
    });
  }

  function render() {
    if (!overlay) return;
    overlay.setProps({ layers: [capaPais(), capaConcesiones(), capaRadios(), capaBarrios(), capaLimites(), capaSeleccion(), capaPozos(), capaSinConcesion(), capaResaltado(), ...capasUbicacion()].filter(Boolean) });
  }

  // ---- cartel de radio censal, barrio o concesión (solo en el visualizador) ----
  // El pozo tiene prioridad: su capa abre la ficha. Si el clic no cae en un pozo (con el mismo margen del tooltip), se busca
  // el radio censal (si la población está a la vista), después el barrio y por último la concesión. Los polígonos no son
  // pickables en deck (le robarían el clic a los pozos): se buscan acá, punto en polígono.
  let seleccion = null; // { tipo: 'radio' | 'barrio' | 'concesion', feature }
  const CAPA_DE = { radio: 'poblacion', barrio: 'barrios', concesion: 'concesiones' }; // qué capa tiene que verse
  const atenuada = (tipo, f) => seleccion?.tipo === tipo && f !== seleccion.feature;
  let cartel = null;    // maplibregl.Popup abierto
  /** Busca, en orden de prioridad, el área que contiene [lon, lat] entre las capas a la vista y abre su cartel. */
  function tocarArea([lng, lat], conTeclado = false) {
    const p = [lng, lat];
    const halladas = {};
    for (const [tipo, fc] of [['radio', radios], ['barrio', barrios], ['concesion', concesiones]]) {
      halladas[tipo] = estado[CAPA_DE[tipo]] && fc ? masChico(fc.features.filter((f) => contiene(f.geometry, p))) : null;
    }
    const tipo = ['radio', 'barrio', 'concesion'].find((t) => halladas[t]);
    if (!tipo) { cerrarCartel(); return; }
    // el cartel del radio suma el barrio, si esa capa también se ve (el barrio no tiene cartel propio ahí)
    const extra = tipo === 'radio' && halladas.barrio ? { barrio: halladas.barrio.properties.barrio } : {};
    abrirCartel(tipo, halladas[tipo], { lng, lat }, extra, conTeclado);
  }
  function abrirCartel(tipo, feature, lngLat, extra, conTeclado) {
    const html = cartelArea?.(tipo, feature.properties, extra);
    if (!html) return;
    cerrarCartel();
    seleccion = { tipo, feature };
    // Con mouse o dedo no le saca el foco al mapa; con teclado lo lleva a la ✕. padding: no se abre debajo del panel.
    cartel = new maplibregl.Popup({ closeButton: true, closeOnClick: false, focusAfterOpen: conTeclado, maxWidth: '260px',
      className: 'cartel-area', padding: paddingPanel() })
      .setLngLat(lngLat).setHTML(html).addTo(map);
    cartel.getElement().setAttribute('role', 'status');
    cartel.on('close', () => {
      cartel = null; seleccion = null; render();
      // abierto con teclado y cerrado con la ✕: el foco quedó en la nada (el cartel ya no está); vuelve al mapa
      if (conTeclado && (!document.activeElement || document.activeElement === document.body)) map.getCanvas().focus();
    });
    render();
  }
  function cerrarCartel() { cartel?.remove(); } // el evento 'close' borra la selección
  // Teclado: con el mapa enfocado, las flechas lo mueven y Enter consulta el centro de lo que se ve (sin el panel): pozo,
  // radio, barrio o concesión. Una mira marca ese punto mientras el mapa tiene el foco del teclado.
  const mira = document.createElement('div');
  mira.className = 'mira-teclado';
  mira.setAttribute('aria-hidden', 'true');
  map.getContainer().appendChild(mira);
  function puntoConsulta() {
    const p = paddingPanel();
    const { width, height } = map.getContainer().getBoundingClientRect();
    return { x: (p.left + width - p.right) / 2, y: (p.top + height - p.bottom) / 2 };
  }
  map.getCanvas().addEventListener('focus', () => {
    if (!explorando || !map.getCanvas().matches(':focus-visible')) return;
    const { x, y } = puntoConsulta();
    Object.assign(mira.style, { left: `${x}px`, top: `${y}px` });
    mira.classList.add('visible');
  });
  map.getCanvas().addEventListener('blur', () => mira.classList.remove('visible'));
  map.getCanvas().addEventListener('keydown', (ev) => {
    if (!explorando || !overlay || ev.key !== 'Enter') return;
    ev.preventDefault(); // si no, la misma tecla "aprieta" la ✕ del cartel recién abierto (el foco pasa a ella) y lo cierra
    const pt = puntoConsulta();
    const c = map.unproject([pt.x, pt.y]);
    let pozo = null;
    try { pozo = overlay.pickObject({ x: pt.x, y: pt.y, radius: 6, layerIds: ['pozos'] }); } catch { /* deck todavía no está listo */ }
    if (pozo?.index >= 0) { cerrarCartel(); onClickPozo?.(pozos.cols.idpozo[pozo.index], pozo.index); return; }
    tocarArea([c.lng, c.lat], true);
  });
  // Escape: primero el cartel, en otro Escape la ficha (su listener está en explore.js). Con la Metodología abierta, es de ella.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !cartel || document.querySelector('.ventana[open]')) return;
    cerrarCartel();
    ev.stopImmediatePropagation();
  });

  // Foco con teclado: durante el recorrido el mapa no es interactivo, así que su lienzo no entra en el
  // orden de tabulación; el lienzo de deck.gl es solo dibujo y nunca lo hace.
  let explorando = false;
  function ajustarFoco() {
    const lienzo = map.getCanvas();
    lienzo.tabIndex = explorando ? 0 : -1;
    for (const c of map.getContainer().querySelectorAll('canvas')) {
      if (c === lienzo) continue;
      c.tabIndex = -1;
      c.setAttribute('aria-hidden', 'true');
    }
  }
  map.on('load', () => { ajustarFoco(); cargarEstiloRemoto(map); });

  // Mapa base papel o satélite. La imagen va apenas arriba del fondo del estilo; en satélite se apagan los rellenos
  // del mapa papel (agua, usos del suelo, edificios) y quedan calles, rutas, límites y nombres: un mapa híbrido.
  // Si el estilo todavía no terminó de cargar, se aplica cuando carga (y otra vez si se reemplaza por el remoto).
  function aplicarBase() {
    try {
      if (estado.satelite && !map.getLayer('satelite')) {
        if (!map.getSource('satelite')) map.addSource('satelite', FUENTE_SATELITE);
        const encima = map.getStyle().layers.find((c) => c.type !== 'background');
        map.addLayer({ id: 'satelite', type: 'raster', source: 'satelite' }, encima?.id);
      }
      if (map.getLayer('satelite')) map.setLayoutProperty('satelite', 'visibility', estado.satelite ? 'visible' : 'none');
      for (const c of map.getStyle().layers) {
        if (c.type === 'fill') map.setLayoutProperty(c.id, 'visibility', estado.satelite ? 'none' : 'visible');
      }
    } catch {
      map.once('style.load', aplicarBase);
    }
  }
  map.on('style.load', () => { if (estado.satelite) aplicarBase(); });
  // al cambiar de estilo (remoto cargado) deck.gl conserva sus capas; nada que hacer.

  const oyentes = [];

  // Recalcula filtros y conteos con el estado actual y dibuja (solo si ya están los pozos).
  function actualizar({ fundir = false, repintar = false } = {}) {
    if (!pozos) return;
    if (repintar) { pintarPozos(); attrColor = { value: colores, size: 4, normalized: true }; }
    visibles = recalcularFiltro();
    armarDatosPozos();
    const c = estado.resaltado !== null ? coordsDe(estado.resaltado) : null;
    datosResaltado = c ? [c] : [];
    if (fundir) fundirEntrada();
    else render();
    for (const f of oyentes) f(estado);
  }

  // ---- API que usan main.js, story.js y explore.js ----
  return {
    map,
    estado,
    get visibles() { return visibles; },
    /** Pozos por estado (índice = estado_cod) que pasan los filtros salvo el de estado; con el ejido
     *  enfocado, solo los del ejido. */
    get conteos() { return conteos; },
    /** Pozos visibles en áreas que no figuran como concesión vigente (los del anillo). */
    get sinConcesion() { return sinConcesion; },
    /** Segundo tiempo de la carga: baja deck.gl y dibuja pozos y polígonos con el estado que haya
     *  (el recorrido pudo haber avanzado mientras tanto). */
    async cargarCapas(datos) {
      deck = await cargarDeck();
      ({ pozos, radios, limites, concesiones, barrios } = datos);
      colores = new Uint8Array(pozos.n * 4);
      pasa = new Float32Array(pozos.n);
      pasaSinConcesion = new Float32Array(pozos.n);
      attrPosicion = { value: pozos.positions, size: 2 };
      attrColor = { value: colores, size: 4, normalized: true };
      pintarPozos();
      overlay = new deck.MapboxOverlay({
        interleaved: false,
        layers: [],
        pickingRadius: 6, // los puntos miden 2–7 px: sin margen, tocarlos con el dedo es casi imposible
        getTooltip: ({ layer, index }) => {
          if (layer?.id !== 'pozos' || index < 0) return null;
          const html = tooltipPozo?.(pozos.cols.idpozo[index], index);
          return html ? { html, className: 'tooltip-pozo', style: ESTILO_TOOLTIP } : null;
        },
        onHover: ({ layer, index }) => {
          map.getCanvas().style.cursor = explorando && layer?.id === 'pozos' && index >= 0 ? 'pointer' : '';
        },
        // Clic que ninguna capa atendió (la de pozos devuelve true): cartel de radio, barrio o concesión. En un doble clic
        // (acercar) no se abre.
        onClick: (info, ev) => {
          if (explorando && info.coordinate && !(ev?.srcEvent?.detail > 1)) tocarArea(info.coordinate);
        },
      });
      map.addControl(overlay);
      actualizar({ fundir: estado.pozos });
      if (marcadorPendiente) mostrarMarcador(...marcadorPendiente);
      if (historiasPendientes) mostrarHistorias(historiasPendientes);
      ajustarFoco();
    },
    /** Último tiempo: los pozos de todo el país (solo el paso País). */
    agregarPais(datos) {
      pais = datos;
      prepararPais();
      render();
    },
    aplicar(cambios = {}) {
      const eraUnSolo = estado.soloId !== null;
      const habiaPozos = estado.pozos;
      const enfoque = [estado.enfocarEjido, estado.enfocarZonaNorte];
      const eraSatelite = estado.satelite;
      Object.assign(estado, cambios);
      // Copia propia: los pasos del recorrido definen su Set y el panel modifica el del mapa; no compartirlos.
      if (cambios.estadosVisibles) estado.estadosVisibles = new Set(cambios.estadosVisibles);
      if (estado.satelite !== eraSatelite) aplicarBase();
      if (seleccion && !estado[CAPA_DE[seleccion.tipo]]) cerrarCartel();
      const aparecenPozos = (eraUnSolo && estado.soloId === null) || (!habiaPozos && estado.pozos);
      actualizar({ fundir: aparecenPozos, repintar: estado.enfocarEjido !== enfoque[0] || estado.enfocarZonaNorte !== enfoque[1] });
      return visibles;
    },
    /** Avisa después de cada cambio (el panel resincroniza controles, leyenda y contadores). */
    alCambiar(fn) { oyentes.push(fn); },
    marcador: mostrarMarcador,
    /** Pozos marcados de las historias (tarjeta 7): [{ idpozo, etiqueta }] o null para sacarlos. */
    historias: mostrarHistorias,
    resaltarHistoria,
    /** fn(i) cuando se toca el marcador de la historia i. */
    alTocarHistoria(fn) { alTocarHistoriaFn = fn; },
    volar(vista, opciones = {}) {
      // El padding siempre se pasa explícito: MapLibre lo conserva entre vuelos si no.
      let padding = opciones.padding || { top: 0, bottom: 0, left: 0, right: 0 };
      // Vista por límites ([[oeste, sur], [este, norte]]): centro y zoom para esta pantalla, sin lo que tapa el padding.
      // cameraForBounds ya corre el centro por el padding, así que el vuelo va sin padding (si no, lo corre dos veces).
      if (vista.bounds) {
        // MapLibre le suma al padding pedido el que haya dejado un vuelo anterior (transform.padding): con un vuelo previo
        // con padding (p. ej. el del Pozo N° 2 en el cierre), el encuadre salía más lejos o, en el celular, no salía.
        // Se lo lleva a cero sin mover lo que se ve: el punto del centro de la pantalla pasa a ser el centro.
        const previo = map.getPadding();
        if (previo.top || previo.bottom || previo.left || previo.right) {
          const { clientWidth: w, clientHeight: h } = map.getContainer();
          map.jumpTo({ center: map.unproject([w / 2, h / 2]), padding: { top: 0, bottom: 0, left: 0, right: 0 } });
        }
        vista = map.cameraForBounds(vista.bounds, { padding }) || { center: map.getCenter(), zoom: map.getZoom() };
        padding = { top: 0, bottom: 0, left: 0, right: 0 };
      }
      // Con "reducir movimiento" se salta directo (MapLibre lo haría solo, pero `essential` lo impide).
      if (reducirMovimiento()) { map.jumpTo({ ...vista, padding }); return Promise.resolve(); }
      const duracion = opciones.duration ?? 1600;
      map.flyTo({ ...vista, duration: 1600, essential: true, ...opciones, padding });
      // Promesa que se cumple al terminar (o cortarse) el vuelo. El oyente va después de flyTo: el moveend del vuelo que
      // este corta se dispara adentro de flyTo. Por las dudas, un reloj la cumple igual.
      return new Promise((listo) => {
        const fin = () => { clearTimeout(reloj); map.off('moveend', fin); listo(); };
        const reloj = setTimeout(fin, duracion + 500);
        map.on('moveend', fin);
      });
    },
    filaDe(idpozo) { return pozos?.filaPorId.get(idpozo); },
    coordsDe,
    /** Centro y zoom actuales (para volver al visualizador como se lo dejó). */
    vista() {
      const c = map.getCenter();
      return { center: [c.lng, c.lat], zoom: map.getZoom() };
    },
    /** Salta a una vista sin animación. */
    irA(vista) { map.jumpTo({ ...vista, padding: { top: 0, bottom: 0, left: 0, right: 0 } }); },
    /** Agrega un grupo de botones propio (satélite, ubicación) junto a los de zoom. */
    agregarControl(elemento) { map.addControl({ onAdd: () => elemento, onRemove: () => elemento.remove() }, 'bottom-right'); },
    /** Dibuja (o borra, con null) la ubicación de la persona: { lng, lat, precision } (precisión en metros). */
    mostrarUbicacion(pos) { datosUbicacion = pos ? [pos] : []; render(); },
    limitesCuenca,
    /** fn se llama cuando la persona arrastra el mapa (el seguimiento de la ubicación se detiene). */
    alMoverConLaMano(fn) { map.on('dragstart', fn); },
    habilitarExploracion(on) {
      // En el visualizador el mapa es libre: la rueda acerca, el mouse o un dedo lo mueven, anda el teclado.
      // En el recorrido no toma gestos: la rueda y el dedo desplazan el texto.
      for (const h of GESTOS) on ? map[h].enable() : map[h].disable();
      if (on) map.touchZoomRotate.disableRotation();
      explorando = on;
      if (!on) cerrarCartel();
      document.body.classList.toggle('explorando', on);
      ajustarFoco();
      render(); // barrios y ejido cambian de color entre el recorrido y el visualizador
    },
  };
}

/** ¿El punto [lon, lat] cae dentro de un Polygon o MultiPolygon de GeoJSON? (par-impar; los huecos restan) */
function contiene(geom, p) {
  const poligonos = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  return poligonos.some(([exterior, ...huecos]) => enAnillo(p, exterior) && !huecos.some((h) => enAnillo(p, h)));
}
/** De los polígonos que contienen el punto, el más chico (el más específico: las concesiones se pisan en los bordes). */
function masChico(features) {
  if (features.length < 2) return features[0] || null;
  const area = (f) => {
    const g = f.geometry;
    const polis = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let a = 0;
    for (const [ext] of polis) for (let i = 0, j = ext.length - 1; i < ext.length; j = i++) a += (ext[j][0] + ext[i][0]) * (ext[j][1] - ext[i][1]);
    return Math.abs(a / 2);
  };
  return features.reduce((min, f) => (area(f) < area(min) ? f : min));
}
function enAnillo([x, y], anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const ESTILO_TOOLTIP = {
  backgroundColor: 'rgba(255, 252, 246, 0.97)',
  color: PALETA.texto,
  font: '14px/1.35 "Source Sans 3", system-ui, sans-serif',
  padding: '6px 10px',
  borderRadius: '4px',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
  maxWidth: '260px',
};

function hexARgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
