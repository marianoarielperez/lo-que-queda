// Recorrido guiado. Cada paso: texto (editable sin tocar el resto del código), vista del mapa
// y qué capas/filtros se activan. Las cifras se leen de resumen.json (R) para que nunca
// se desincronicen con los datos.

import scrollama from 'scrollama';
import { fmt, pct, esc } from './data.js';
import { dibujarProduccion } from './chart.js';

// Fuentes de contexto que citan las tarjetas (normas, informes, comunicados oficiales). Verificadas en
// docs/investigacion-contexto.md; la metodología (index.html) lista las mismas.
const CONTEXTO = {
  minEconomia: 'https://www.argentina.gob.ar/noticias/13-de-diciembre-descubrimiento-de-petroleo-en-comodoro-rivadavia',
  ley24799: 'https://www.argentina.gob.ar/normativa/nacional/ley-24799-42613/texto',
  ypf20F: 'https://www.sec.gov/Archives/edgar/data/904851/000119312525067155/d866694d20f.htm',
  decreto1509: 'https://sistemas.chubut.gov.ar/digesto/sistema/consulta.php?idile1=87339',
  municipioCH679: 'https://www.comodoro.gov.ar/2024/08/27/el-municipio-intervino-ante-un-nuevo-derrame-de-petroleo-en-un-yacimiento-ypf/',
  vacaMuerta: 'https://www.argentina.gob.ar/economia/energia/vaca-muerta/historia',
  vacaMuerta2019: 'https://www.argentina.gob.ar/noticias/por-el-crecimiento-de-vaca-muerta-la-produccion-de-petroleo-y-gas-fue-record-en-mayo',
  radiosGas: 'https://www.comodoro.gov.ar/2024/03/20/coluccio-con-esta-ordenanza-nos-ponemos-a-la-altura-de-la-industria-hidrocarburifera/',
  res340419: 'https://www.comodoro.gov.ar/archivos/boletin_oficial/pdf/bol_002-2020.pdf',
  relevamiento: 'https://www.comodoro.gov.ar/2024/09/26/el-municipio-avanza-en-el-relevamiento-de-pozos-petroleros-inactivos-dentro-su-ejido/',
  zonaNorte: 'https://www.comodoro.gov.ar/miciudad/relevamiento-de-barrios/zona-norte/',
};
// Núcleo de zona norte (Km 3 a Km 8, Laprida, Castelli), elegido por los autores para las tarjetas 6 y 7: Astra, Diadema y
// Caleta Córdova quedan afuera. [[oeste, sur], [este, norte]]; el mapa lo ajusta a cada pantalla.
const NUCLEO_ZONA_NORTE = [[-67.601, -45.870], [-67.389, -45.769]];
/** Enlace a un dataset por su clave en resumen.datasets (procesar.py → DATASETS). */
const dataset = (R, clave, t) => ({ t, url: R.datasets?.find((d) => d.clave === clave)?.url });

/** Texto de la portada (debajo del título). Texto definido por los autores el 26/09.
 *  La frase de la desocupación depende de resumen.eph (INDEC, EPH, serie de datos.gob.ar): "la más alta en
 *  décadas" solo si pasaron 20 años o más desde un valor mayor. Por el error muestral de la EPH nunca se dice
 *  cuánto subió; la fuente declara el coeficiente de variación. */
export function textoPortada(R) {
  const E = R.eph;
  let desocupacion = '';
  if (E) {
    const anios = E.anios_sin_un_valor_mayor; // null = el más alto de toda la serie
    if (anios === null || anios >= 20) desocupacion = ' y la desocupación es la más alta en décadas';
    else if (anios >= 5) desocupacion = ` y la desocupación es la más alta desde ${E.ultimo_valor_mayor.periodo.slice(0, 4)}`;
  }
  const texto = `Comodoro Rivadavia creció al ritmo del petróleo durante más de un siglo. Los barrios se armaron al lado de los pozos, y a veces encima. Hoy la cuenca produce cada vez menos, YPF se fue${desocupacion}. Pero los pozos siguen ahí. Esta es la historia de lo que queda… cuando el petróleo se va.`;
  // Partes para htmlFuente(…, ''): el texto se lee igual que antes, con los nombres enlazados.
  const fuente = ['Fuentes: ', dataset(R, 'capitulo_iv', 'Secretaría de Energía')];
  if (E) {
    let detalle = ` (${pct(E.desocupacion)} %`;
    if (E.provisorio) detalle += ', provisorio';
    if (E.cv) detalle += `, coeficiente de variación ${pct(E.cv)} %`;
    fuente.push('; ', dataset(R, 'eph_indec', `INDEC, EPH, ${E.trimestre}.º trimestre de ${E.anio}`), `${detalle})`);
  }
  fuente.push('.');
  return { texto, fuente };
}

/** Devuelve la definición de pasos con las cifras ya resueltas. */
export function definirPasos(R) {
  const c = R.cuenca, e = R.ejido, p = R.poblacion, pr = R.produccion;
  const t = R.trayectoria; // null si no se procesó el mensual
  const Z = R.zona_norte; // barrios de zona norte con pozos y población (procesar.py → resumir_zona_norte)
  const astra = Z.por_barrio.Astra, mosconi = Z.por_barrio['General Enrique Mosconi'];
  // Ritmo de declaraciones de abandono: años completos posteriores al primero de la serie
  // (el primer año arrastra los pozos que ya estaban abandonados al inicio) y anteriores al último (incompleto).
  let ritmo = null;
  if (t) {
    const anios = Object.entries(t.abandonados_por_anio_de_declaracion).map(([a, n]) => [Number(a), n]).sort((x, y) => x[0] - y[0]);
    const desde = Number(t.cobertura.desde.slice(0, 4)), hasta = Number(t.cobertura.hasta.slice(0, 4));
    const completos = anios.filter(([a]) => a > desde && a < hasta);
    if (completos.length) {
      const total = completos.reduce((acc, [, n]) => acc + n, 0);
      const paradosMas5 = t.inactivos_por_tiempo_sin_producir.mas_de_5_anios; // 60 meses declarados sin producir (procesar.py)
      ritmo = { desdeAnio: completos[0][0], hastaAnio: completos[completos.length - 1][0], total, porAnio: Math.round(total / completos.length), paradosMas5 };
    }
  }
  return [
    {
      // El primer pozo. Solo se ve el Pozo N° 2 (idpozo 121014), con su ícono; el mapa vuela desde la portada.
      // Hechos y fuentes: docs/investigacion-contexto.md. Texto definido por los autores el 26/09.
      id: 1, kicker: 'Paso 1 · El primer pozo', cifra: '1907',
      titulo: 'buscaban agua y encontraron petróleo',
      texto: 'El Estado perforaba en Comodoro Rivadavia para darle agua al pueblo. La mañana del 13 de diciembre, a unos 540 metros, del Pozo N° 2 salió petróleo. Al día siguiente, un decreto del presidente Figueroa Alcorta prohibió pedir permisos mineros en cinco leguas a la redonda. En su lugar hoy está el Museo Nacional del Petróleo.',
      fuente: [{ t: 'Ministerio de Economía', url: CONTEXTO.minEconomia }, { t: 'Ley 24.799', url: CONTEXTO.ley24799 }],
      foto: {
        src: `${import.meta.env.BASE_URL}img/pozo2-1907.jpg`,
        alt: 'Torre de perforación del Pozo N° 2, con carros tirados por caballos y trabajadores al pie, diciembre de 1907',
        credito: 'Pozo N° 2, diciembre de 1907. Fototeca de Comodoro Rivadavia – Archivo Histórico Municipal (negativo cedido por el AGN).',
      },
      vista: { center: [-67.480922, -45.837491], zoom: 8 },
      vuelo: { duration: 3000 },
      focoArriba: true, // en celular, el pozo queda en la mitad de arriba (la tarjeta tapa la de abajo)
      marcador: { idpozo: 121014, etiqueta: 'Pozo N° 2 · 1907' },
      capas: { soloId: 121014, estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      // Texto de los autores del 27/09. "Desde <año>" solo si la caída es de todos los años hasta el último completo.
      id: 2, kicker: 'Paso 2 · País', cifra: `${pct(pr.gsj_pct_ref)} %`,
      titulo: 'del petróleo argentino sale hoy del Golfo San Jorge',
      texto: `Pero en ${pr.anio_base} era el ${pct(pr.gsj_pct_base)} %. Desde entonces la Cuenca Neuquina, gracias a Vaca Muerta, ${pr.neuquina_ref_sobre_base_pct >= 200 ? 'más que duplicó' : 'aumentó'} su producción y hoy aporta el ${pct(pr.neuquina_pct_ref)} % del total nacional. La cuenca más vieja del país, en cambio, ${pr.gsj_cae_desde ? `produce menos cada año desde ${pr.gsj_cae_desde}: hoy, el` : 'produce hoy el'} ${pr.gsj_ref_sobre_base_pct} % de lo que producía en ${pr.anio_base}.`,
      fuente: [dataset(R, 'serie_cuencas', 'Secretaría de Energía, serie histórica de producción por cuenca'), { t: 'Historia de Vaca Muerta (Secretaría de Energía)', url: CONTEXTO.vacaMuerta }, { t: 'Argentina.gob.ar, 2/7/2019', url: CONTEXTO.vacaMuerta2019 }],
      vista: { center: [-66.5, -41.5], zoom: 4.3 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: true, concesiones: false, barrios: false },
      grafico: true,
    },
    {
      id: 3, kicker: 'Paso 3 · Cuenca', cifra: fmt(c.total),
      titulo: 'pozos registrados. Es la cuenca con más pozos del país',
      texto: `Dos de cada tres no producen: ${fmt(c.Inactivo)} inactivos, ${fmt(c['A abandonar'])} a abandonar y ${fmt(c.Abandonado)} abandonados, según lo que cada operadora declara ante la Secretaría de Energía. De los ${fmt(R.antiguedad.ya_en_2006)} pozos que ya figuraban en 2006, hoy producen ${fmt(R.antiguedad.ya_en_2006_extraccion_efectiva)}.${t ? ` Y ${fmt(t.nunca_en_serie_no_abandonados)} pozos que no están declarados abandonados no registran ni un mes de producción desde ${t.cobertura.desde.slice(0, 4)}.` : ''}`,
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía, Capítulo IV – Pozos')],
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      id: 4, kicker: 'Paso 4 · Operadoras', cifra: fmt(c.ypf_pozos_listado_anterior),
      titulo: 'pozos de YPF cambiaron de manos',
      texto: `Entre 2024 y 2026 YPF se retiró de la cuenca (Proyecto Andes). Hoy sus pozos figuran a nombre de PECOM, Patagonia Resources, Clear, Quintana, Roch y otras. Y ${fmt(c.sin_empresa.total)} pozos no tienen ninguna empresa asignada; ${fmt(c.sin_empresa.Abandonado)} de ellos están abandonados.`,
      fuente: [dataset(R, 'listado_operadoras', 'Secretaría de Energía'), { t: 'YPF, Form 20-F 2024 (SEC)', url: CONTEXTO.ypf20F }, { t: 'Decreto Chubut 1509/2024', url: CONTEXTO.decreto1509 }],
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: true, barrios: false },
      // TODO semana 3: colorear por operadora con animación antes/después (ver docs/plans).
    },
    {
      id: 5, kicker: 'Paso 5 · Ejido', cifra: fmt(e.total),
      titulo: 'pozos dentro del ejido de Comodoro Rivadavia',
      // "Producen" = extracción efectiva; "activos" incluye inyección y reparación. Población: solo los radios de Comodoro.
      texto: `De los ${fmt(e.Activo)} pozos activos, solo ${fmt(e.extraccion_efectiva)} producen. Otros ${fmt(e.Abandonado)} están abandonados. ${fmt(p.comodoro.pobl_en_radios_con_pozo)} personas, el ${pct(p.comodoro.pobl_en_radios_con_pozo_pct)} % de Comodoro, viven en un radio censal con al menos un pozo.${t ? ` ${fmt(t.ejido_nunca_en_serie)} de los pozos del ejido no produjeron ni un mes desde ${t.cobertura.desde.slice(0, 4)}.` : ''}`,
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), dataset(R, 'radios_censo', 'Municipalidad de Comodoro Rivadavia, Censo 2022')],
      vista: { center: [-67.55, -45.85], zoom: 10.3 },
      // Toda la cuenca, con los pozos fuera del ejido atenuados: la ciudad es el foco (plan 2.3).
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarEjido: true, poblacion: true, limites: true, pais: false, concesiones: false, barrios: false },
    },
    {
      // Zona norte (texto de los autores del 27/09): los 36 barrios al norte del cerro Chenque según el municipio.
      // Población del CSV municipal por barrio (Censo 2022). El Pozo N° 2 cae en General Mosconi (resumen: barrio_pozo_2).
      id: 6, kicker: 'Paso 6 · Zona norte', cifra: `${Z.barrios_con_pozos} de ${Z.barrios}`,
      titulo: 'barrios de zona norte tienen pozos dentro',
      texto: `Son los barrios al norte del cerro Chenque. Dentro de sus límites hay ${fmt(Z.pozos.total)} pozos: ${fmt(Z.pozos.Abandonado)} abandonados y ${fmt(Z.pozos.Activo)} activos. El ${pct(Z.pobl_en_barrios_con_10_o_mas_pct)} % de sus vecinos vive en un barrio con diez pozos o más. Casi todos estos barrios nacieron como asentamientos petroleros${astra.total > astra.poblacion ? `; en Astra hoy hay más pozos que habitantes (${fmt(astra.total)} y ${fmt(astra.poblacion)})` : ''}. En General Mosconi (Km 3), el barrio del Pozo N° 2, hay ${fmt(mosconi.total)} pozos y ${mosconi.Activo ? `${fmt(mosconi.Activo)} activos` : 'ninguno está activo'}.`,
      // Las fuentes de Astra, Km 5 y Mosconi (Km 3) quedan en la metodología (decisión de los autores: no engordar la tarjeta).
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), { t: 'Municipalidad de Comodoro Rivadavia, Relevamiento de barrios', url: CONTEXTO.zonaNorte },
        dataset(R, 'poblacion_barrios', 'Censo 2022 por barrio')],
      vista: { bounds: NUCLEO_ZONA_NORTE },
      focoArriba: true,
      marcador: { idpozo: 121014, etiqueta: 'Pozo N° 2 · 1907' }, // se destaca; el resto de los pozos sigue a la vista
      // Toda la cuenca, con los pozos fuera de los barrios de zona norte atenuados y el contorno de esos barrios.
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarZonaNorte: true, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      // Convivir con pozos (autores, 27/09): pozos de barrios de zona norte que la operadora no dio de baja y lo que documenta
      // el municipio. Lo que dice el municipio va entre comillas y atribuido; nada de adjetivos propios (regla 2).
      id: 7, kicker: 'Paso 7 · Convivir con pozos', cifra: fmt(Z.no_dados_de_baja),
      titulo: 'pozos en barrios de zona norte que la operadora no dio de baja',
      texto: `Están declarados inactivos o a abandonar y ${fmt(Z.no_dados_de_baja_5_anios)} llevan al menos cinco años sin producir. Según el municipio, los radios de seguridad de los pozos impiden a los vecinos «tener servicios como el gas»; en un asentamiento de Don Bosco, que declaró «zona de riesgo» en 2019, los ocupantes no pueden comprar la tierra mientras siga ese radio. También releva los pozos inactivos y anota si hay «interacción con viviendas». En 2024 intervino por la surgencia del CH-679.`,
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), '; Municipalidad de Comodoro Rivadavia: ', { t: '20/3/2024', url: CONTEXTO.radiosGas },
        ', ', { t: 'Res. 3404-19', url: CONTEXTO.res340419 }, ', ', { t: '26/9/2024', url: CONTEXTO.relevamiento }, ' y ',
        { t: '27/8/2024', url: CONTEXTO.municipioCH679 }],
      fuenteSep: '',
      vista: { bounds: NUCLEO_ZONA_NORTE },
      focoArriba: true,
      marcador: { idpozo: 121621, etiqueta: 'CH-679' },
      // Mismo encuadre que la tarjeta 6, pero solo los pozos inactivos o a abandonar (los que no están dados de baja).
      capas: { estadosVisibles: new Set([1, 2]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarZonaNorte: true, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      id: 8, kicker: 'Paso 8 · Lo que queda', cifra: fmt(c.sin_produccion),
      titulo: 'pozos sin producir en la cuenca',
      texto: `${ritmo ? `${fmt(ritmo.paradosMas5)} pozos llevan más de cinco años sin producir y no están declarados abandonados. Entre ${ritmo.desdeAnio} y ${ritmo.hastaAnio} las operadoras declararon abandonados ${fmt(ritmo.total)} pozos: unos ${fmt(ritmo.porAnio)} por año. ` : ''}YPF tenía provisionados US$ 915 millones por abandono de pozos al cierre de 2024. No existe un registro público de pasivos ambientales hidrocarburíferos. Lo que hay es este dato, pozo por pozo. Exploralo.`,
      fuente: [{ t: 'YPF, Form 20-F 2024, Nota 17 (SEC)', url: CONTEXTO.ypf20F }],
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: true, pais: false, concesiones: false, barrios: false },
      final: true,
    },
  ];
}

/** Fuente de una tarjeta como HTML: cada parte es texto o { t, url } (enlace que se abre en otra pestaña,
 *  para no perder el lugar en el recorrido). Sin url, la parte queda como texto. */
export function htmlFuente(partes, sep = '; ') {
  return partes.map((p) => (typeof p === 'string' ? esc(p)
    : p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.t)}<span class="sr-only"> (se abre en otra pestaña)</span></a>`
      : esc(p.t))).join(sep);
}

/** "73,7 %" no se parte en dos renglones (el "%" solo al principio de una línea, en el celular). */
const sinCorte = (t) => t.replace(/ %/g, ' %');

/** Inserta las tarjetas en #story y conecta scrollama con el mapa. Devuelve { pausar, reanudar }. */
export function montarRecorrido({ pasos, mapa, produccion }) {
  const cont = document.getElementById('story');
  for (const s of pasos) {
    const sec = document.createElement('section');
    sec.className = 'step';
    sec.dataset.step = s.id;
    sec.innerHTML = `
      <div class="card${s.foto ? ' card-foto' : ''}">
        ${s.foto ? `<figure class="foto-paso"><picture><source srcset="${s.foto.src.replace(/\.jpg$/, '.webp')}" type="image/webp"><img src="${s.foto.src}" width="1000" height="562" alt="${s.foto.alt}" loading="lazy"></picture><figcaption>${s.foto.credito}</figcaption></figure>` : ''}
        <p class="kicker">${s.kicker}</p>
        <p class="cifra">${s.cifra}</p>
        <h2 class="titulo-paso">${sinCorte(s.titulo)}</h2>
        <p class="texto">${sinCorte(s.texto)}</p>
        ${s.grafico ? '<div class="grafico" id="grafico-cuencas"></div>' : ''}
        ${s.final ? `<div class="acciones-cierre">
          <button type="button" class="empezar" data-ir="explorar">Explorá el mapa</button>
          <button type="button" class="empezar" data-abrir="metodologia">Metodología</button>
        </div>` : ''}
        <p class="fuente">Fuente: ${htmlFuente(s.fuente, s.fuenteSep)}</p>
      </div>`;
    cont.appendChild(sec);
  }
  if (produccion) dibujarProduccion(document.getElementById('grafico-cuencas'), produccion);

  function entrar(seccion) {
    const id = Number(seccion.dataset.step);
    document.querySelectorAll('#story .step').forEach((el) => el.classList.toggle('activa', el === seccion));
    const paso = pasos.find((p) => p.id === id);
    if (!paso) { // portada: el país, sin ningún pozo
      mapa.marcador(null);
      document.body.classList.add('sin-leyenda'); // sin pozos en el mapa, la leyenda no tiene qué explicar
      mapa.aplicar({ soloId: null, pozos: false, soloEjido: false, enfocarEjido: false, enfocarZonaNorte: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false, satelite: false });
      mapa.volar({ center: [-66.5, -41.5], zoom: 4.3 });
      return;
    }
    // Cada paso define su vista completa: los filtros que se hayan tocado en el panel no se arrastran.
    mapa.aplicar({ soloId: null, enfocarEjido: false, enfocarZonaNorte: false, sinProducir: null, satelite: false, pozos: true, ...paso.capas });
    document.body.classList.toggle('sin-leyenda', Boolean(paso.capas.soloId)); // un solo pozo: la leyenda cuenta 44.390
    mapa.marcador(paso.marcador?.idpozo ?? null, paso.marcador?.etiqueta);
    // Lo que tapa la tarjeta: en celular, la mitad de abajo (focoArriba); en escritorio, una vista por límites
    // (vista.bounds) deja libre la columna de la tarjeta.
    let padding;
    if (MOVIL.matches) {
      // Con vista por límites también se dejan libres la franja de la leyenda (arriba) y toda la altura de la tarjeta.
      const porLimites = Boolean(paso.vista.bounds);
      const arriba = porLimites ? Math.round(document.getElementById('leyenda').getBoundingClientRect().bottom) + 8 : 0;
      const abajo = Math.max(window.innerHeight * 0.45, porLimites ? seccion.querySelector('.card').offsetHeight + 16 : 0);
      if (paso.focoArriba) padding = { top: arriba, bottom: Math.round(abajo), left: 0, right: 0 };
    } else if (paso.vista.bounds) {
      const tarjeta = seccion.querySelector('.card').getBoundingClientRect();
      padding = { top: 24, bottom: 24, left: Math.round(tarjeta.right) + 24, right: 24 };
    }
    mapa.volar(paso.vista, { ...(paso.vuelo || {}), ...(padding ? { padding } : {}) });
  }

  // Cuándo cambia de paso. En escritorio, cuando la sección (con la tarjeta centrada) cruza el 55 % de la
  // pantalla. En celular la tarjeta va al pie de su sección, debajo del mapa: se dispara con la tarjeta misma
  // cuando asoma (85 %), así el mapa no cambia mientras todavía se lee la tarjeta anterior.
  const disparador = () => (MOVIL.matches ? { step: '#story .step > .card', offset: 0.85 } : { step: '#story .step', offset: 0.55 });
  let scroller;
  let pausado = false;
  function configurar() {
    scroller?.destroy();
    scroller = scrollama();
    scroller.setup({ ...disparador(), progress: false }).onStepEnter(({ element }) => entrar(element.closest('.step')));
    if (pausado) scroller.disable();
  }
  configurar();
  MOVIL.addEventListener('change', configurar); // p. ej., un celular que se gira y pasa a la vista de escritorio
  window.addEventListener('resize', () => scroller.resize());

  // Paso en pantalla con el mismo criterio que scrollama (para retomar al volver del visualizador).
  function pasoEnPantalla() {
    const { step, offset } = disparador();
    const linea = window.innerHeight * offset;
    let actual = null;
    for (const el of document.querySelectorAll(step)) if (!actual || el.getBoundingClientRect().top <= linea) actual = el;
    return actual.closest('.step');
  }

  return {
    /** Mientras se explora, el recorrido no reacciona al desplazamiento. */
    pausar() { pausado = true; scroller.disable(); },
    /** Al volver del visualizador: vuelve a escuchar y reaplica el paso que quedó en pantalla. */
    reanudar() { pausado = false; scroller.enable(); entrar(pasoEnPantalla()); },
  };
}

const MOVIL = window.matchMedia('(max-width: 700px)');
