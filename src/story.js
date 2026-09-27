// Recorrido guiado. Cada paso: texto (editable sin tocar el resto del código), vista del mapa
// y qué capas/filtros se activan. Las cifras se leen de resumen.json (R) para que nunca
// se desincronicen con los datos.

import scrollama from 'scrollama';
import { fmt, pct } from './data.js';
import { dibujarProduccion } from './chart.js';

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
  let fuente = 'Fuentes: Secretaría de Energía';
  if (E) {
    fuente += `; INDEC, EPH, ${E.trimestre}.º trimestre de ${E.anio} (${pct(E.desocupacion)} %`;
    if (E.provisorio) fuente += ', provisorio';
    if (E.cv) fuente += `, coeficiente de variación ${pct(E.cv)} %`;
    fuente += ')';
  }
  fuente += '.';
  return { texto, fuente };
}

/** Devuelve la definición de pasos con las cifras ya resueltas. */
export function definirPasos(R) {
  const c = R.cuenca, e = R.ejido, p = R.poblacion, pr = R.produccion, k = R.km3.en_ejido;
  const t = R.trayectoria; // null si no se procesó el mensual
  const radio = (p.radio_urbano_mas_pozos || p.radio_mas_pozos)[0];
  const B = R.barrios; // null si no hay capa de barrios
  const topBarrios = B ? B.por_barrio.slice(0, 3) : [];
  const barrioSinActivos = B ? B.por_barrio.find((b) => b.activos === 0 && b.pozos >= 100) : null;
  // Ritmo de declaraciones de abandono: años completos posteriores al primero de la serie
  // (el primer año arrastra los pozos que ya estaban abandonados al inicio) y anteriores al último (incompleto).
  let ritmo = null;
  if (t) {
    const anios = Object.entries(t.abandonados_por_anio_de_declaracion).map(([a, n]) => [Number(a), n]).sort((x, y) => x[0] - y[0]);
    const desde = Number(t.cobertura.desde.slice(0, 4)), hasta = Number(t.cobertura.hasta.slice(0, 4));
    const completos = anios.filter(([a]) => a > desde && a < hasta);
    if (completos.length) {
      const total = completos.reduce((acc, [, n]) => acc + n, 0);
      const paradosMas5 = t.inactivos_por_tiempo_sin_producir['5_a_9_anios'] + t.inactivos_por_tiempo_sin_producir.nunca_en_serie;
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
      fuente: 'Ministerio de Economía; Ley 24.799',
      foto: {
        src: `${import.meta.env.BASE_URL}img/pozo2-1907.jpg`,
        alt: 'Torre de perforación del Pozo N° 2, con carros tirados por caballos y trabajadores al pie, diciembre de 1907',
        credito: 'Pozo N° 2, diciembre de 1907. Fototeca de Comodoro Rivadavia – Archivo Histórico Municipal (negativo cedido por el AGN).',
      },
      vista: { center: [-67.480922, -45.837491], zoom: 8 },
      vuelo: { duration: 3000 },
      pozoArriba: true, // en celular, el pozo queda en la mitad de arriba (la tarjeta tapa la de abajo)
      marcador: { idpozo: 121014, etiqueta: 'Pozo N° 2 · 1907' },
      capas: { soloId: 121014, estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      id: 2, kicker: 'Paso 2 · País', cifra: `${pct(pr.gsj_pct_ref)} %`,
      titulo: 'del petróleo argentino sale hoy del Golfo San Jorge',
      texto: `En ${pr.anio_base} era el ${pct(pr.gsj_pct_base)} %. Mientras la Cuenca Neuquina más que se duplicó y el shale ya es el ${pct(pr.shale_pct_ref)} % del total, la cuenca más vieja del país produce el ${pr.gsj_ref_sobre_base_pct} % de lo que producía entonces.`,
      fuente: 'Secretaría de Energía, serie histórica de producción por cuenca',
      vista: { center: [-66.5, -41.5], zoom: 4.3 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: true, concesiones: false, barrios: false },
      grafico: true,
    },
    {
      id: 3, kicker: 'Paso 3 · Cuenca', cifra: fmt(c.total),
      titulo: 'pozos en la cuenca con más pozos del país',
      texto: `Dos de cada tres no producen: ${fmt(c.Inactivo)} inactivos, ${fmt(c['A abandonar'])} a abandonar y ${fmt(c.Abandonado)} abandonados, según lo que cada operadora declara ante la Secretaría de Energía. De los ${fmt(R.antiguedad.ya_en_2006)} pozos que ya figuraban en 2006, producen ${fmt(R.antiguedad.ya_en_2006_por_grupo.Activo)}.${t ? ` Y ${fmt(t.nunca_en_serie_no_abandonados)} pozos que no están declarados abandonados no registran ni un mes de producción desde ${t.cobertura.desde.slice(0, 4)}.` : ''}`,
      fuente: 'Secretaría de Energía, Capítulo IV – Pozos',
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      id: 4, kicker: 'Paso 4 · Operadoras', cifra: fmt(c.ypf_pozos_listado_anterior),
      titulo: 'pozos de YPF cambiaron de manos',
      texto: `Entre 2024 y 2026 YPF se retiró de la cuenca (Proyecto Andes). Hoy sus pozos figuran a nombre de PECOM, Patagonia Resources, Clear, Quintana, Roch y otras. Y ${fmt(c.sin_empresa.total)} pozos no tienen ninguna empresa asignada; ${fmt(c.sin_empresa.Abandonado)} de ellos están abandonados.`,
      fuente: 'Secretaría de Energía; YPF, Form 20-F 2024 (SEC); Decreto Chubut 1509/2024',
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: true, barrios: false },
      // TODO semana 3: colorear por operadora con animación antes/después (ver docs/plans).
    },
    {
      id: 5, kicker: 'Paso 5 · Ejido', cifra: fmt(e.total),
      titulo: 'pozos dentro del ejido de Comodoro Rivadavia',
      texto: `${fmt(e.Activo)} producen. ${fmt(e.Abandonado)} están abandonados. ${fmt(p.pobl_en_radios_con_pozo)} personas, el ${pct(p.pobl_en_radios_con_pozo_pct)} % de Comodoro y Rada Tilly, viven en un radio censal con al menos un pozo.${t ? ` ${fmt(t.ejido_nunca_en_serie)} de los pozos del ejido no produjeron ni un mes desde ${t.cobertura.desde.slice(0, 4)}.` : ''}`,
      fuente: 'Secretaría de Energía; Municipalidad de Comodoro Rivadavia, Censo 2022',
      vista: { center: [-67.55, -45.85], zoom: 10.3 },
      // Toda la cuenca, con los pozos fuera del ejido atenuados: la ciudad es el foco (plan 2.3).
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarEjido: true, poblacion: true, limites: true, pais: false, concesiones: false, barrios: false },
    },
    {
      id: 6, kicker: 'Paso 6 · Km 3', cifra: fmt(k.total),
      titulo: 'pozos en un yacimiento que es un barrio',
      texto: `En Campamento Central – Bella Vista Este, el yacimiento del Pozo N° 2, hoy hay ${fmt(k.Abandonado)} pozos abandonados y ${fmt(k.Activo)} en producción. La Resolución SE 5/96 exige abandono definitivo en ejidos urbanos; muchos de estos pozos son anteriores a esa norma.${topBarrios.length ? ` Los barrios con más pozos: ${topBarrios.map((b) => `${b.barrio} (${fmt(b.pozos)})`).join(', ')}.${barrioSinActivos ? ` En ${barrioSinActivos.barrio} hay ${fmt(barrioSinActivos.pozos)} pozos y ninguno produce.` : ''}` : ''}`,
      fuente: 'Secretaría de Energía; Resolución SE 5/96 (InfoLeg)',
      vista: { center: [-67.49, -45.82], zoom: 13 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: true, poblacion: false, limites: true, pais: false, concesiones: false, barrios: true },
    },
    {
      id: 7, kicker: 'Paso 7 · Un radio censal', cifra: fmt(radio.pozos),
      titulo: `pozos en un radio censal donde viven ${fmt(radio.pobl)} personas`,
      texto: `${B?.barrio_del_radio_urbano_mas_pozos ? `Barrio ${B.barrio_del_radio_urbano_mas_pozos}. ` : ''}Es el radio censal urbano con más pozos de la ciudad: ${fmt(radio.abandonados)} abandonados y ${fmt(radio.activos)} activos. En agosto de 2024 el municipio intervino por la surgencia del pozo abandonado CH-679, en el Yacimiento Central, que afectó el arroyo Belgrano.`,
      fuente: 'Censo 2022; Municipalidad de Comodoro Rivadavia, 27/8/2024',
      vista: { center: [radio.lon ?? -67.50, radio.lat ?? -45.83], zoom: 14.5 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: true, poblacion: true, limites: false, pais: false, concesiones: false, barrios: true },
    },
    {
      id: 8, kicker: 'Paso 8 · Lo que queda', cifra: fmt(c.sin_produccion),
      titulo: 'pozos sin producir en la cuenca',
      texto: `${ritmo ? `${fmt(ritmo.paradosMas5)} pozos llevan más de cinco años sin producir y no están declarados abandonados. Entre ${ritmo.desdeAnio} y ${ritmo.hastaAnio} las operadoras declararon abandonados ${fmt(ritmo.total)} pozos: unos ${fmt(ritmo.porAnio)} por año. ` : ''}YPF tenía provisionados US$ 915 millones por abandono de pozos al cierre de 2024. No existe un registro público de pasivos ambientales hidrocarburíferos. Lo que hay es este dato, pozo por pozo. Exploralo.`,
      fuente: 'YPF, Form 20-F 2024, Nota 17 (SEC)',
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: true, pais: false, concesiones: false, barrios: false },
      final: true,
    },
  ];
}

/** Inserta las tarjetas en #story y conecta scrollama con el mapa. */
export function montarRecorrido({ pasos, mapa, produccion, alTerminar }) {
  const cont = document.getElementById('story');
  for (const s of pasos) {
    const sec = document.createElement('section');
    sec.className = 'step';
    sec.dataset.step = s.id;
    sec.innerHTML = `
      <div class="card${s.foto ? ' card-foto' : ''}">
        ${s.foto ? `<figure class="foto-paso"><img src="${s.foto.src}" alt="${s.foto.alt}" loading="lazy"><figcaption>${s.foto.credito}</figcaption></figure>` : ''}
        <p class="kicker">${s.kicker}</p>
        <p class="cifra">${s.cifra}</p>
        <h2 class="titulo-paso">${s.titulo}</h2>
        <p class="texto">${s.texto}</p>
        ${s.grafico ? '<div class="grafico" id="grafico-cuencas"></div>' : ''}
        <p class="fuente">Fuente: ${s.fuente}</p>
      </div>`;
    cont.appendChild(sec);
  }
  if (produccion) dibujarProduccion(document.getElementById('grafico-cuencas'), produccion);

  const scroller = scrollama();
  scroller
    .setup({ step: '#story .step', offset: 0.55, progress: false })
    .onStepEnter(({ element }) => {
      const id = Number(element.dataset.step);
      document.querySelectorAll('#story .step').forEach((el) => el.classList.toggle('activa', el === element));
      const paso = pasos.find((p) => p.id === id);
      if (!paso) { // portada: el país, sin ningún pozo
        mapa.marcador(null);
        document.body.classList.add('sin-leyenda'); // sin pozos en el mapa, la leyenda no tiene qué explicar
        mapa.aplicar({ soloId: null, pozos: false, soloEjido: false, enfocarEjido: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false });
        mapa.volar({ center: [-66.5, -41.5], zoom: 4.3 });
        return;
      }
      // Cada paso define su vista completa: los filtros que se hayan tocado en el panel no se arrastran.
      mapa.aplicar({ soloId: null, enfocarEjido: false, sinProducir: null, pozos: true, ...paso.capas });
      document.body.classList.toggle('sin-leyenda', Boolean(paso.capas.soloId)); // un solo pozo: la leyenda cuenta 44.390
      mapa.marcador(paso.marcador?.idpozo ?? null, paso.marcador?.etiqueta);
      const movil = window.matchMedia('(max-width: 700px)').matches;
      const padding = paso.pozoArriba && movil ? { top: 0, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 } : undefined;
      mapa.volar(paso.vista, { ...(paso.vuelo || {}), ...(padding ? { padding } : {}) });
      if (paso.final) alTerminar?.();
    });
  window.addEventListener('resize', () => scroller.resize());
  return scroller;
}
