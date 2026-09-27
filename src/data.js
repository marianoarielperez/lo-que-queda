// Carga de datos. Todo sale de public/data/, generado por data-pipeline/procesar.py.
// Nunca tipear cifras a mano: vienen de resumen.json.

const BASE = `${import.meta.env.BASE_URL}data/`;

const DTYPES = {
  uint8: Uint8Array, uint16: Uint16Array, uint32: Uint32Array, float32: Float32Array,
};

async function json(name) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`No se pudo cargar ${name} (HTTP ${r.status})`);
  return r.json();
}

/** Lee un binario de columnas según su meta.json y devuelve { meta, n, cols, positions }. */
async function leerBinario(nombre) {
  const meta = await json(`${nombre}.meta.json`);
  const r = await fetch(`${BASE}${nombre}.bin`);
  if (!r.ok) throw new Error(`No se pudo cargar ${nombre}.bin (HTTP ${r.status})`);
  const buf = await r.arrayBuffer();
  const fin = Math.max(...meta.columns.map((c) => c.offset + c.bytes));
  if (buf.byteLength < fin) throw new Error(`${nombre}.bin llegó incompleto (${buf.byteLength} de ${fin} bytes)`);
  const cols = {};
  for (const c of meta.columns) {
    const T = DTYPES[c.dtype];
    cols[c.name] = new T(buf, c.offset, c.bytes / T.BYTES_PER_ELEMENT);
  }
  // deck.gl trabaja mejor con un array de posiciones plano [lon, lat, lon, lat, ...]
  const n = meta.n;
  const positions = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    positions[i * 2] = cols.lon[i];
    positions[i * 2 + 1] = cols.lat[i];
  }
  return { meta, n, cols, positions };
}

// Tramos de tiempo sin producir (filtro del panel). meses_cod (procesar.py): ≤ 12 = produjo en el último año de la serie;
// ≥ 60 = 60 meses o más declarados sin producir (no cuentan los meses en que la operadora ya no declara el pozo);
// 13–59 = el resto; 65535 = ningún mes con producción en toda la serie. Mismos cortes que resumen.trayectoria.
export const TRAMOS_SIN_PRODUCIR = ['ultimo_anio', '1_a_5', 'mas_de_5', 'nunca'];

/** Vista de la cuenca (tarjeta 8 y arranque del visualizador): los pozos sin los extremos (percentiles 0,2–99,8),
 *  como [[oeste, sur], [este, norte]]. El mapa la ajusta a cada pantalla, sin lo que tapan la tarjeta o el panel. */
export const VISTA_CUENCA = { bounds: [[-70.0, -46.85], [-67.3, -45.5]] };

/** Lo que tapa el panel del visualizador: a la derecha en la computadora, abajo en el celular. En la computadora la tarjeta 8
 *  usa el mismo encuadre (el panel todavía oculto se mide por su CSS), así el mapa no se mueve al pasar al visualizador. */
export function paddingPanel() {
  const panel = document.getElementById('explore');
  if (window.matchMedia('(max-width: 700px)').matches) {
    const r = panel.getBoundingClientRect();
    return { top: 16, bottom: Math.round(window.innerHeight - r.top) + 16, left: 16, right: 16 };
  }
  const cs = getComputedStyle(panel); // right y width (border-box) valen aunque el panel esté oculto
  return { top: 24, bottom: 24, left: 24, right: Math.round(parseFloat(cs.right) + parseFloat(cs.width)) + 24 };
}
function tramoSinProducir(m) {
  if (m === 65535) return 3;
  if (m <= 12) return 0;
  return m < 60 ? 1 : 2;
}

/** Lee pozos_gsj.bin según su meta y devuelve arrays tipados por columna. */
export async function cargarPozos() {
  const pozos = await leerBinario('pozos_gsj');
  const { n, cols } = pozos;
  cols.tramo_sp = new Uint8Array(n);
  for (let i = 0; i < n; i++) cols.tramo_sp[i] = tramoSinProducir(cols.meses_cod[i]);
  // idpozo -> fila; las siglas se cargan aparte (cargarSiglas) cuando hacen falta
  const filaPorId = new Map();
  for (let i = 0; i < n; i++) filaPorId.set(cols.idpozo[i], i);
  return { ...pozos, filaPorId };
}

/** Pozos del país entero (lon, lat, estado, es_gsj) para el paso País. */
export const cargarPais = () => leerBinario('pozos_pais');

export const cargarResumen = () => json('resumen.json');
export const cargarConcesiones = () => json('concesiones.geojson').catch(() => null);
export const cargarBarrios = () => json('barrios.geojson').catch(() => null);
export const cargarRadios = () => json('radios.geojson');
export const cargarLimites = () => json('limites.geojson');
export const cargarProduccion = () => json('produccion_cuencas.json');
export const cargarOperadores = () => json('operadores.json');

const cacheFichas = new Map();
/** Ficha de un pozo: se carga el lote (1.000 pozos por archivo) a demanda. */
export async function cargarFicha(idpozo) {
  const lote = Math.floor(idpozo / 1000);
  if (!cacheFichas.has(lote)) {
    // si el pedido falla, se saca de la caché para poder reintentar
    cacheFichas.set(lote, json(`fichas/${lote}.json`).catch((e) => { cacheFichas.delete(lote); throw e; }));
  }
  const recs = await cacheFichas.get(lote);
  return recs[String(idpozo)] || null;
}

/** Sigla sin puntos, guiones, espacios ni tildes, en mayúsculas: "YPF.Ch.-679" → "YPFCH679". */
export const normalizarSigla = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

let siglas = null;
/** Índice de siglas (siglas.json, ~1 MB): se baja una sola vez, al primer uso del buscador o del tooltip. */
export function cargarSiglas() {
  siglas ??= json('siglas.json').then(({ id, s }) => {
    const porId = new Map();
    for (let i = 0; i < id.length; i++) porId.set(id[i], s[i]);
    return { id, s, norm: s.map(normalizarSigla), porId };
  }).catch((e) => { siglas = null; throw e; });
  return siglas;
}

/** Formato de miles con punto (castellano rioplatense). */
export const fmt = (n) => Math.round(n).toLocaleString('es-AR');

/** Porcentaje o decimal con coma: pct(22.8) → "22,8". */
export const pct = (n, decimales = 1) => n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "2017-01" → "enero de 2017" */
export const mesAnio = (am) => `${MESES[Number(am.slice(5, 7)) - 1]} de ${am.slice(0, 4)}`;

/** Escapa texto para insertarlo en HTML (nombres que vienen de los datos o lo que escribe el usuario). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** ¿El sistema pide reducir el movimiento? (vuelos de cámara, fundidos, desplazamiento suave) */
export const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
