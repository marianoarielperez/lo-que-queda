// Arranque: carga datos, crea el mapa, monta el recorrido y el panel de exploración.

import { cargarPozos, cargarPais, cargarResumen, cargarRadios, cargarLimites, cargarProduccion, cargarConcesiones, cargarBarrios, reducirMovimiento } from './data.js';
import { crearMapa } from './map.js';
import { definirPasos, montarRecorrido, textoPortada } from './story.js';
import { montarExploracion } from './explore.js';
import { montarMetodologia } from './metodologia.js';

async function iniciar() {
  // Todo se pide en paralelo, pero la portada se escribe apenas llega resumen.json (el resto pesa ~3 MB).
  const resto = Promise.all([
    cargarPozos(), cargarPais(), cargarRadios(), cargarLimites(), cargarProduccion(), cargarConcesiones(), cargarBarrios(),
  ]);
  resto.catch(() => {}); // el error se maneja al esperarla, más abajo
  const resumen = await cargarResumen();
  const portada = textoPortada(resumen);
  document.getElementById('portada-texto').textContent = portada.texto;
  document.getElementById('portada-fuente').textContent = portada.fuente;
  montarMetodologia(resumen);
  // Botón de la portada: lleva al primer paso (con teclado también). Sin animación si el sistema lo pide.
  document.getElementById('btn-empezar').addEventListener('click', () => {
    document.querySelector('#story .step[data-step="1"]')?.scrollIntoView({ behavior: reducirMovimiento() ? 'auto' : 'smooth', block: 'center' });
  });

  const [pozos, pais, radios, limites, produccion, concesiones, barrios] = await resto;
  let exploracion;
  const mapa = crearMapa({
    pozos, pais, radios, limites, concesiones, barrios,
    onClickPozo: (idpozo) => exploracion?.alClickPozo(idpozo),
    tooltipPozo: (idpozo, fila) => exploracion?.tooltipPozo(idpozo, fila),
  });
  exploracion = montarExploracion({ mapa, pozos, resumen });

  const pasos = definirPasos(resumen);
  montarRecorrido({ pasos, mapa, produccion, alTerminar: () => exploracion.mostrarPanel() });

  document.body.classList.add('listo');
}

iniciar().catch((err) => {
  console.error(err); // el detalle técnico queda en la consola; a la persona, un aviso que pueda entender
  const aviso = document.createElement('div');
  aviso.className = 'card error';
  aviso.setAttribute('role', 'alert');
  aviso.innerHTML = '<p>No se pudieron cargar los datos. Revisá tu conexión y recargá la página.</p>';
  document.getElementById('story').prepend(aviso);
});
