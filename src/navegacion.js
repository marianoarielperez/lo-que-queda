// Estados de la página (docs/specs/2026-09-27-cierre-y-visualizador-design.md): el recorrido (…/), el
// visualizador (…/#explorar) y dos ventanas: la Metodología (…/#metodologia) y el video (…/#video). Sobre el
// visualizador una ventana se abre sin cambiar la dirección. La dirección y el historial del navegador mandan: los
// botones cambian el historial y la página reacciona, así "Atrás" y los links directos hacen lo mismo que los botones.
// Disparadores: data-ir="explorar" | "inicio", data-abrir="metodologia" | "video" y data-cerrar-ventana (un solo
// escuchador en document: sirve también para las tarjetas que se crean después).

const EXPLORAR = '#explorar';
const sinHash = () => location.pathname + location.search;

/** Reproductor de YouTube en modo de privacidad mejorada: se crea al abrir la ventana (con el clic de quien la abre, así
 *  el navegador deja que arranque solo y con sonido) y se borra al cerrarla, así el video se detiene. */
function montarVideo(ventana) {
  const marco = ventana.querySelector('.video-marco');
  return {
    alAbrir() {
      const id = encodeURIComponent(ventana.dataset.youtube);
      marco.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1" title="Video: Lo que queda, en un minuto" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    },
    alCerrar() { marco.innerHTML = ''; },
  };
}

/** alEntrar / alSalir se llaman al entrar al visualizador y al salir, con la página ya en su lugar. */
export function iniciarNavegacion({ alEntrar, alSalir }) {
  const video = document.getElementById('ventana-video');
  const VENTANAS = {
    metodologia: { hash: '#metodologia', el: document.getElementById('ventana-metodologia') },
    video: { hash: '#video', el: video, ...(video && montarVideo(video)) },
  };
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
    if (exp && !explorando) entrar();
    else if (!exp && explorando) salir();
    // Una ventana va en la dirección (#metodologia, #video) sobre el recorrido; sobre el visualizador, como marca en la
    // entrada del historial (la dirección sigue siendo #explorar).
    for (const [nombre, v] of Object.entries(VENTANAS)) {
      if (!v.el) continue;
      const abierta = location.hash === v.hash || (exp && history.state?.ventana === nombre);
      if (abierta && !v.el.open) {
        v.alAbrir?.();
        v.el.showModal();
      } else if (!abierta && v.el.open) {
        v.el.close();
        v.alCerrar?.();
        if (origenVentana && document.contains(origenVentana)) origenVentana.focus({ preventScroll: true });
        origenVentana = null;
      }
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

  function abrirVentana(nombre, disparador) {
    const v = VENTANAS[nombre];
    if (!v?.el || Object.values(VENTANAS).some((x) => x.el?.open)) return;
    origenVentana = disparador;
    history.pushState({ ventana: nombre }, '', explorando ? EXPLORAR : v.hash);
    aplicar();
  }

  function cerrarVentana() {
    if (!Object.values(VENTANAS).some((x) => x.el?.open)) return;
    if (history.state?.ventana) history.back(); // el "popstate" la cierra
    else { history.replaceState(null, '', explorando ? EXPLORAR : sinHash()); aplicar(); } // se abrió por link
  }

  for (const v of Object.values(VENTANAS)) {
    if (!v.el) continue;
    v.el.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrarVentana(); }); // Escape
    v.el.addEventListener('click', (ev) => { if (ev.target === v.el) cerrarVentana(); }); // clic afuera
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ir], [data-abrir], [data-cerrar-ventana]');
    if (!el || (el.dataset.abrir && !VENTANAS[el.dataset.abrir])) return;
    ev.preventDefault();
    if (el.dataset.ir === 'explorar') irAlVisualizador(el);
    else if (el.dataset.ir === 'inicio') irAlInicio();
    else if (el.dataset.abrir) abrirVentana(el.dataset.abrir, el);
    else cerrarVentana();
  });
  window.addEventListener('popstate', aplicar);
  window.addEventListener('hashchange', aplicar);
  aplicar(); // la dirección con la que se abrió la página

  return { get explorando() { return explorando; } };
}
