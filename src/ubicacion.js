// Botón de ubicación del visualizador (docs/specs/2026-09-27-satelite-y-ubicacion-design.md).
// La ubicación se usa solo en este dispositivo: no se guarda ni se envía, y no se calcula nada con ella (ni
// distancias ni "pozos cerca"). Dentro de la cuenca el mapa sigue a la persona; fuera, solo un aviso.
// No importa MapLibre (así no entra en el JavaScript inicial): dibuja con la API del mapa.

const RETICULA = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3"/></svg>';
const ETIQUETAS = {
  apagado: 'Mostrar mi ubicación',
  buscando: 'Buscando tu ubicación…',
  siguiendo: 'Dejar de mostrar mi ubicación',
  quieto: 'Volver a centrar en mi ubicación',
};
const ZOOM_MINIMO = 14;

/** Monta el botón sobre el mapa. `avisar(texto)` muestra un aviso breve. Devuelve { apagar } (al salir). */
export function montarUbicacion({ mapa, avisar }) {
  const grupo = document.createElement('div');
  grupo.className = 'maplibregl-ctrl maplibregl-ctrl-group botonera';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.innerHTML = RETICULA;
  grupo.append(boton);
  mapa.agregarControl(grupo);

  let estado = 'apagado';
  let vigilancia = null;
  let ultima = null;  // { lng, lat, precision } de la última lectura
  let primera = true; // la primera lectura decide si se vuela o se avisa

  function poner(nuevo) {
    estado = nuevo;
    boton.className = `boton-ubicacion ${nuevo}`;
    boton.setAttribute('aria-label', ETIQUETAS[nuevo]);
    boton.title = ETIQUETAS[nuevo];
  }
  poner('apagado');

  const dentro = ({ lng, lat }) => {
    const [oeste, sur, este, norte] = mapa.limitesCuenca();
    return lng >= oeste && lng <= este && lat >= sur && lat <= norte;
  };
  const centrar = (p, duracion) => mapa.volar({ center: [p.lng, p.lat], zoom: Math.max(mapa.vista().zoom, ZOOM_MINIMO) }, { duration: duracion });

  function recibir(pos) {
    ultima = { lng: pos.coords.longitude, lat: pos.coords.latitude, precision: pos.coords.accuracy };
    mapa.mostrarUbicacion(ultima);
    if (primera) {
      primera = false;
      if (dentro(ultima)) { poner('siguiendo'); centrar(ultima, 1600); }
      else { poner('quieto'); avisar('Estás fuera de la cuenca del Golfo San Jorge.'); }
    } else if (estado === 'siguiendo') centrar(ultima, 500);
  }

  function fallar(err) {
    avisar(err.code === 1 ? 'No se pudo obtener tu ubicación: el permiso está desactivado.' : 'No se pudo obtener tu ubicación.');
    apagar();
  }

  function encender() {
    if (!('geolocation' in navigator)) { avisar('Este navegador no permite ubicarte.'); return; }
    primera = true;
    poner('buscando');
    vigilancia = navigator.geolocation.watchPosition(recibir, fallar, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  function apagar() {
    if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
    vigilancia = null;
    ultima = null;
    mapa.mostrarUbicacion(null);
    poner('apagado');
  }

  boton.addEventListener('click', () => {
    if (estado === 'apagado') encender();
    else if (estado === 'quieto' && ultima && dentro(ultima)) { poner('siguiendo'); centrar(ultima, 800); }
    else apagar();
  });
  // Mover el mapa con la mano deja de seguir (el punto queda)
  mapa.alMoverConLaMano(() => { if (estado === 'siguiendo') poner('quieto'); });

  return { apagar };
}
