// Estados de la página (docs/specs/2026-09-27-cierre-y-visualizador-design.md): el recorrido (…/), el
// visualizador (…/#explorar) y la ventana de Metodología (…/#metodologia, o encima del visualizador sin cambiar la
// dirección). La dirección y el historial del navegador mandan: los botones cambian el historial y la página
// reacciona, así "Atrás" y los links directos hacen lo mismo que los botones.
// Disparadores: data-ir="explorar" | "inicio", data-abrir="metodologia" y data-cerrar-metodologia (un solo
// escuchador en document: sirve también para las tarjetas que se crean después).

const EXPLORAR = '#explorar';
const METODOLOGIA = '#metodologia';
const sinHash = () => location.pathname + location.search;

/** alEntrar / alSalir se llaman al entrar al visualizador y al salir, con la página ya en su lugar. */
export function iniciarNavegacion({ alEntrar, alSalir }) {
  const ventana = document.getElementById('ventana-metodologia');
  let explorando = false;
  let scrollAntes = 0;       // desplazamiento del recorrido al entrar ("Atrás" vuelve ahí)
  let origen = null;         // botón o enlace que abrió el visualizador (recupera el foco al volver con "Atrás")
  let alInicio = false;      // la salida es por "Volver al inicio" (arriba de todo) y no por "Atrás"
  let origenVentana = null;  // botón o enlace que abrió la ventana (recupera el foco al cerrarla)

  // El desplazamiento lo maneja esta función: mientras se explora el recorrido está oculto y el navegador no
  // podría restaurarlo solo.
  history.scrollRestoration = 'manual';

  function aplicar() {
    const exp = location.hash === EXPLORAR;
    // La ventana va en la dirección (#metodologia) sobre el recorrido; sobre el visualizador, como marca en la
    // entrada del historial (la dirección sigue siendo #explorar).
    const met = location.hash === METODOLOGIA || (exp && history.state?.metodologia === true);
    if (exp && !explorando) entrar();
    else if (!exp && explorando) salir();
    if (met && !ventana.open) ventana.showModal();
    else if (!met && ventana.open) {
      ventana.close();
      if (origenVentana && document.contains(origenVentana)) origenVentana.focus({ preventScroll: true });
      origenVentana = null;
    }
  }

  function entrar() {
    explorando = true;
    document.body.classList.add('modo-explorar');
    alEntrar();
  }

  function salir() {
    explorando = false;
    document.body.classList.remove('modo-explorar');
    window.scrollTo({ top: alInicio ? 0 : scrollAntes, behavior: 'instant' });
    alSalir();
    const foco = alInicio ? document.getElementById('btn-empezar') : origen;
    if (foco && document.contains(foco)) foco.focus({ preventScroll: true });
    alInicio = false;
    origen = null;
  }

  function irAlVisualizador(disparador) {
    if (explorando) return;
    origen = disparador;
    scrollAntes = window.scrollY;
    history.pushState(null, '', EXPLORAR);
    aplicar();
  }

  function irAlInicio() {
    if (!explorando) return;
    alInicio = true;
    history.pushState(null, '', sinHash());
    aplicar();
  }

  function abrirMetodologia(disparador) {
    if (ventana.open) return;
    origenVentana = disparador;
    history.pushState({ metodologia: true }, '', explorando ? EXPLORAR : METODOLOGIA);
    aplicar();
  }

  function cerrarMetodologia() {
    if (!ventana.open) return;
    if (history.state?.metodologia) history.back(); // el "popstate" la cierra
    else { history.replaceState(null, '', explorando ? EXPLORAR : sinHash()); aplicar(); } // se abrió por link
  }

  ventana.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrarMetodologia(); }); // Escape
  ventana.addEventListener('click', (ev) => { if (ev.target === ventana) cerrarMetodologia(); }); // clic afuera
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ir], [data-abrir="metodologia"], [data-cerrar-metodologia]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.ir === 'explorar') irAlVisualizador(el);
    else if (el.dataset.ir === 'inicio') irAlInicio();
    else if (el.dataset.abrir === 'metodologia') abrirMetodologia(el);
    else cerrarMetodologia();
  });
  window.addEventListener('popstate', aplicar);
  window.addEventListener('hashchange', aplicar);
  aplicar(); // la dirección con la que se abrió la página

  return { get explorando() { return explorando; } };
}
