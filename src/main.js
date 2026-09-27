// Arranque: carga datos, crea el mapa, monta el recorrido y el panel de exploración.
//
// En dos tiempos (plan 3.4), para que la portada aparezca enseguida también con red o equipos lentos:
// 1) resumen.json (5 KB) → texto de la portada, metodología y tarjetas; MapLibre (mapa base) en su propio chunk.
// 2) deck.gl + pozos + capas de Comodoro → pozos en el mapa y panel. Mientras tanto el botón de la portada lo avisa
//    y el recorrido se puede leer: el mapa se pone al día solo cuando llegan los datos.
// 3) Al final, los pozos de todo el país (el binario más pesado; solo lo usa el paso 2).

import { cargarPozos, cargarPais, cargarResumen, cargarRadios, cargarLimites, cargarProduccion, cargarConcesiones, cargarBarrios, reducirMovimiento } from './data.js';
import { definirPasos, montarRecorrido, textoPortada, htmlFuente } from './story.js';
import { montarExploracion } from './explore.js';
import { montarMetodologia } from './metodologia.js';
import { iniciarNavegacion } from './navegacion.js';

// Cede el hilo principal entre etapas pesadas: así el navegador puede pintar y responder en el medio.
const pausa = () => new Promise((resolver) => setTimeout(resolver, 0));
// Espera a que la portada esté pintada (el callback de requestAnimationFrame corre justo antes de pintar).
// En una pestaña de fondo el navegador no pinta ni llama a requestAnimationFrame: ahí no se espera (si no,
// la carga quedaría frenada hasta que alguien mire la pestaña).
function despuesDePintar() {
  return new Promise((resolver) => {
    if (document.visibilityState === 'hidden') { resolver(); return; }
    const alOcultar = () => { if (document.visibilityState === 'hidden') listo(); };
    const listo = () => { document.removeEventListener('visibilitychange', alOcultar); resolver(); };
    document.addEventListener('visibilitychange', alOcultar);
    requestAnimationFrame(() => setTimeout(listo, 0));
  });
}
// La foto de la portada es lo más grande de la primera pantalla: lo pesado espera a que termine de bajar
// (o a que pasen 2,5 s) para no disputarle la conexión.
function fotoPortada() {
  const img = document.querySelector('.foto-portada img');
  if (!img || img.complete) return Promise.resolve();
  return new Promise((resolver) => {
    img.addEventListener('load', resolver, { once: true });
    img.addEventListener('error', resolver, { once: true });
    setTimeout(resolver, 2500);
  });
}

async function iniciar() {
  const empezar = document.getElementById('btn-empezar');
  avisarCarga(empezar, true);

  const panel = document.getElementById('explore');
  let exploracion = null;
  let recorrido = null;
  // Estados de la página (recorrido, visualizador …/#explorar). Si se entra al visualizador antes de que lleguen
  // los pozos (p. ej., por el link), el panel avisa que está cargando y el visualizador se arma cuando llegan.
  const nav = iniciarNavegacion({
    alEntrar: () => {
      recorrido?.pausar();
      if (exploracion) exploracion.entrar();
      else panel.classList.remove('hidden');
      if (!exploracion) panel.classList.add('cargando');
    },
    alSalir: () => {
      if (exploracion) exploracion.salir();
      else panel.classList.add('hidden');
      recorrido?.reanudar();
    },
  });

  // Primero lo liviano (resumen y la serie del gráfico). Los datos pesados y el código del mapa esperan a que la
  // portada esté pintada y su foto bajada: evaluar MapLibre lleva tiempo de CPU y los binarios le disputan la red.
  // El país espera además a que lleguen los pozos.
  const produccion = cargarProduccion();
  const portadaLista = fotoPortada().then(despuesDePintar);
  const datos = portadaLista.then(() => Promise.all([cargarPozos(), cargarRadios(), cargarLimites(), cargarConcesiones(), cargarBarrios()]));
  const moduloMapa = portadaLista.then(() => import('./map.js'));
  for (const p of [moduloMapa, produccion, datos]) p.catch(() => {}); // el error se maneja al esperarlas

  // ---- 1) portada, metodología y recorrido ----
  const resumen = await cargarResumen();
  const portada = textoPortada(resumen);
  document.getElementById('portada-texto').textContent = portada.texto;
  document.getElementById('portada-fuente').innerHTML = htmlFuente(portada.fuente, '');
  montarMetodologia(resumen);
  // Botón de la portada: lleva al primer paso (con teclado también). Sin animación si el sistema lo pide.
  empezar.addEventListener('click', () => {
    document.querySelector('#story .step[data-step="1"]')?.scrollIntoView({ behavior: reducirMovimiento() ? 'auto' : 'smooth', block: 'center' });
  });

  const { crearMapa, precargarDeck } = await moduloMapa;
  const mapa = crearMapa({
    onClickPozo: (idpozo) => nav.explorando && exploracion?.alClickPozo(idpozo), // la ficha es del visualizador
    tooltipPozo: (idpozo, fila) => exploracion?.tooltipPozo(idpozo, fila),
  });
  precargarDeck();
  const pasos = definirPasos(resumen);
  recorrido = montarRecorrido({ pasos, mapa, produccion: await produccion });
  if (nav.explorando) recorrido.pausar();

  // ---- 2) pozos y capas ----
  const [pozos, radios, limites, concesiones, barrios] = await datos;
  await pausa();
  await mapa.cargarCapas({ pozos, radios, limites, concesiones, barrios });
  await pausa();
  exploracion = montarExploracion({ mapa, pozos, resumen });
  if (nav.explorando) exploracion.entrar();
  avisarCarga(empezar, false);
  document.body.classList.add('listo');

  // ---- 3) el país ----
  cargarPais().then((pais) => mapa.agregarPais(pais)).catch((err) => console.error('No se pudo cargar la capa del país.', err));
}

/** El botón de la portada dice "Cargando el mapa…" hasta que están los pozos. */
function avisarCarga(boton, cargando) {
  const texto = boton.querySelector('.empezar-texto');
  texto.dataset.original ??= texto.textContent;
  texto.textContent = cargando ? 'Cargando el mapa…' : texto.dataset.original;
  boton.classList.toggle('cargando', cargando);
}

iniciar().catch((err) => {
  console.error(err); // el detalle técnico queda en la consola; a la persona, un aviso que pueda entender
  const aviso = document.createElement('div');
  aviso.className = 'card error';
  aviso.setAttribute('role', 'alert');
  aviso.innerHTML = '<p>No se pudieron cargar los datos. Revisá tu conexión y recargá la página.</p>';
  document.getElementById('story').prepend(aviso);
});
