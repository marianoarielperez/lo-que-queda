// Estados de la página (docs/specs/2026-09-27-cierre-y-visualizador-design.md): el recorrido (…/) y el
// visualizador (…/#explorar). La dirección y el historial del navegador mandan: los botones cambian el historial
// y la página reacciona, así "Atrás" y los links directos hacen lo mismo que los botones.
// Los disparadores llevan data-ir="explorar" | "inicio" (un solo escuchador en document: sirve también para las
// tarjetas que se crean después).

const EXPLORAR = '#explorar';
const sinHash = () => location.pathname + location.search;

/** alEntrar / alSalir se llaman al entrar al visualizador y al salir, con la página ya en su lugar. */
export function iniciarNavegacion({ alEntrar, alSalir }) {
  let explorando = false;
  let scrollAntes = 0;  // desplazamiento del recorrido al entrar ("Atrás" vuelve ahí)
  let origen = null;    // botón o enlace que abrió el visualizador (recupera el foco al volver con "Atrás")
  let alInicio = false; // la salida es por "Volver al inicio" (arriba de todo) y no por "Atrás"

  // El desplazamiento lo maneja esta función: mientras se explora el recorrido está oculto y el navegador no
  // podría restaurarlo solo.
  history.scrollRestoration = 'manual';

  function aplicar() {
    const exp = location.hash === EXPLORAR;
    if (exp && !explorando) entrar();
    else if (!exp && explorando) salir();
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

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ir]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.ir === 'explorar') irAlVisualizador(el);
    else if (el.dataset.ir === 'inicio') irAlInicio();
  });
  window.addEventListener('popstate', aplicar);
  window.addEventListener('hashchange', aplicar);
  aplicar(); // la dirección con la que se abrió la página

  return { get explorando() { return explorando; } };
}
