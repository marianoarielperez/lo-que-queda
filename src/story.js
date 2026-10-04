// Recorrido guiado. Cada paso: texto (editable sin tocar el resto del código), vista del mapa
// y qué capas/filtros se activan. Las cifras se leen de resumen.json (R) para que nunca
// se desincronicen con los datos.

import scrollama from 'scrollama';
import { fmt, pct, esc, VISTA_CUENCA, paddingPanel, cargarFicha, reducirMovimiento } from './data.js';
import { dibujarProduccion } from './chart.js';

// Fuentes de contexto que citan las tarjetas (normas, informes, comunicados oficiales). Verificadas en
// docs/investigacion-contexto.md; la metodología (index.html) lista las mismas.
const CONTEXTO = {
  minEconomia: 'https://www.argentina.gob.ar/noticias/13-de-diciembre-descubrimiento-de-petroleo-en-comodoro-rivadavia',
  casaRosada1907: 'https://www.casarosada.gob.ar/informacion/actividad-oficial/9-noticias/50819-dia-nacional-del-petroleo-a-117-anos-de-su-descubrimiento',
  decreto135: 'https://sistemas.chubut.gov.ar/digesto/sistema/consulta.php?idile1=88733',
  ypf20F: 'https://www.sec.gov/Archives/edgar/data/904851/000119312525067155/d866694d20f.htm',
  ypf6K2026: 'https://www.sec.gov/Archives/edgar/data/904851/000119312526057719/d47643d6k.htm',
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
/** Una proporción en palabras («casi dos de cada tres») si queda cerca de una fracción simple; si no, el porcentaje.
 *  Así la frase sigue a los datos y no hay que tipearla. */
function fraccionEnPalabras(parte, total) {
  const r = parte / total;
  const FRACCIONES = [[1, 5, 'uno de cada cinco'], [1, 4, 'uno de cada cuatro'], [1, 3, 'uno de cada tres'], [1, 2, 'uno de cada dos'], [2, 3, 'dos de cada tres'], [3, 4, 'tres de cada cuatro']];
  const [n, d, texto] = FRACCIONES.reduce((a, b) => (Math.abs(b[0] / b[1] - r) < Math.abs(a[0] / a[1] - r) ? b : a));
  const dif = r - n / d;
  if (Math.abs(dif) > 0.04) return `el ${pct(r * 100)} %`;
  return Math.abs(dif) < 0.005 ? texto : `${dif < 0 ? 'casi' : 'más de'} ${texto}`;
}
/** «produce solo uno de cada cinco» / «producen dos de cada tres»: el verbo concuerda con la fracción y «solo» va si es
 *  menos de la mitad. */
function produciendo(parte, total) {
  const f = fraccionEnPalabras(parte, total);
  const verbo = /^(casi |más de )?(uno|el) /.test(f) ? 'produce' : 'producen';
  return `${verbo}${parte / total < 0.5 ? ' solo' : ''} ${f}`;
}
/** Pozos de una historia: `idpozo` es un número o, si hay varios en el mismo lugar, una lista (el marcador va en el primero). */
const pozosDe = (h) => [].concat(h.idpozo);
/** «a», «a y b», «a, b y c». */
const enLista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''));
// Foto de una historia del paso 7 (public/img/historias/, la genera scripts/optimizar_fotos.py).
// posicion: object-position del recorte 16:9. proporcion: [ancho, alto] de la foto web cuando va con su forma propia, sin recorte
// (hoy las diez son 16:9 y no los usan).
const fotoHistoria = (archivo, alt, credito, posicion, proporcion) => ({ src: `${import.meta.env.BASE_URL}img/historias/${archivo}.jpg`, alt, credito, posicion, proporcion });
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
  const texto = `Comodoro Rivadavia creció al ritmo del petróleo durante más de un siglo. Los barrios se armaron alrededor de los pozos, y a veces encima. Hoy la cuenca produce cada vez menos, YPF se fue${desocupacion}. Pero los pozos siguen ahí. Esta es la historia de lo que queda… cuando el petróleo se va.`;
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

/** Foto propia de una tarjeta (de los autores: sin crédito hasta el fallo, por el seudónimo; lo aclara la Metodología).
 *  El epígrafe va donde las demás llevan el crédito. Solo se ve en la computadora (en el celular, .foto-paso se oculta). */
const fotoPropia = (archivo, alt, epigrafe) => ({ src: `${import.meta.env.BASE_URL}img/${archivo}.jpg`, alt, credito: epigrafe });

/** Devuelve la definición de pasos con las cifras ya resueltas. */
export function definirPasos(R) {
  const c = R.cuenca, e = R.ejido, p = R.poblacion, pr = R.produccion;
  const t = R.trayectoria; // null si no se procesó el mensual
  const A = R.antiguedad; // padrón de primera producción (desde enero de 2006)
  const Z = R.zona_norte; // barrios de zona norte con pozos y población (procesar.py → resumir_zona_norte)
  const astra = Z.por_barrio.Astra, mosconi = Z.por_barrio['General Enrique Mosconi'];
  return [
    {
      // El primer pozo. Solo se ve el Pozo N° 2 (idpozo 121014), con su ícono; el mapa vuela desde la portada.
      // Hechos y fuentes: docs/investigacion-contexto.md. Texto definido por los autores el 26/09.
      id: 1, kicker: 'Paso 1 · El primer pozo', cifra: '1907',
      titulo: 'buscaban agua y encontraron petróleo',
      // Texto de los autores (01/10). El decreto es S/N del 14/12/1907 (Figueroa Alcorta–Ezcurra, art. 15 de la Ley 4.167):
      // «en un radio de 5 leguas kilométricas, a todo rumbo, contándose desde el centro de la población»; la Casa Rosada lo
      // resume como reserva fiscal de 5 leguas. «Quince años después, Hipólito Yrigoyen fundó YPF»: la nota del Ministerio.
      texto: 'El 13 de diciembre, mientras se perforaba en busca de agua, del Pozo N° 2 comenzó a surgir petróleo. Al día siguiente, el presidente Figueroa Alcorta firmó un decreto que prohibía cualquier permiso minero en un radio de cinco leguas (25 km) alrededor del pueblo. Quince años después, Hipólito Yrigoyen creó Yacimientos Petrolíferos Fiscales (YPF).',
      fuente: [{ t: 'Ministerio de Economía', url: CONTEXTO.minEconomia }, { t: 'Casa Rosada, 13/12/2024', url: CONTEXTO.casaRosada1907 }],
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
      // Texto de los autores (27/09; final, 01/10). "Desde <año>" solo si la caída es de todos los años hasta el último completo:
      // antes de 2019 hubo repuntes chicos (2009, 2012, 2014, 2015, 2018), así que «cada vez menos» es la tendencia.
      id: 2, kicker: 'Paso 2 · País', cifra: `${pct(pr.gsj_pct_ref)} %`,
      titulo: 'del petróleo argentino sale hoy del Golfo San Jorge',
      texto: `Pero en ${pr.anio_base} era el ${pct(pr.gsj_pct_base)} %. Desde entonces la Cuenca Neuquina, gracias a Vaca Muerta, ${pr.neuquina_ref_sobre_base_pct >= 200 ? 'más que duplicó' : 'aumentó'} su producción y hoy aporta el ${pct(pr.neuquina_pct_ref)} % del total nacional. La cuenca más vieja del país, en cambio, ${pr.gsj_cae_desde && pr.gsj_ref_sobre_base_pct < 100 ? `produce cada vez menos: desde ${pr.gsj_cae_desde}, cae todos los años.` : `produce hoy el ${pct(pr.gsj_ref_sobre_base_pct, 0)} % de lo que producía en ${pr.anio_base}.`}`,
      fuente: [dataset(R, 'serie_cuencas', 'Secretaría de Energía, serie histórica de producción por cuenca'), { t: 'Historia de Vaca Muerta (Secretaría de Energía)', url: CONTEXTO.vacaMuerta }, { t: 'Argentina.gob.ar, 2/7/2019', url: CONTEXTO.vacaMuerta2019 }],
      vista: { center: [-66.5, -41.5], zoom: 4.3 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: true, concesiones: false, barrios: false },
      grafico: true,
    },
    {
      id: 3, kicker: 'Paso 3 · Cuenca', cifra: fmt(c.total),
      titulo: 'pozos registrados. Es la cuenca con más pozos del país',
      // Texto de los autores (01/10). «Casi dos de cada tres» lo arma fraccionEnPalabras() con sin_produccion / total.
      // «Ya existían en 2006» = primer mes en el padrón de primera producción = enero de 2006, el inicio del padrón (todo pozo
      // anterior figura con ese mes, aunque esté abandonado: se sigue declarando). «Uno de cada cinco» = fraccionEnPalabras().
      // «desde entonces» = desde 2006, el primer año del padrón («ya existían en 2006») y de la serie mensual (02/10); si la
      // serie empezara otro año, la frase vuelve a decir el año.
      texto: `Pero ${fraccionEnPalabras(c.sin_produccion, c.total)} no producen: ${fmt(c.Inactivo)} figuran inactivos, ${fmt(c['A abandonar'])} a abandonar y ${fmt(c.Abandonado)} abandonados, según lo declarado por las operadoras. De los ${fmt(A.ya_en_2006)} pozos que ya existían en 2006, hoy ${produciendo(A.ya_en_2006_extraccion_efectiva, A.ya_en_2006)}: ${fmt(A.ya_en_2006_extraccion_efectiva)}.${t ? ` Además, ${fmt(t.nunca_en_serie_no_abandonados_petroleo_gas)} pozos de petróleo o gas, inactivos o a abandonar, no registran un solo mes de producción ${t.cobertura.desde.startsWith('2006') ? 'desde entonces' : `desde ${t.cobertura.desde.slice(0, 4)}`}.` : ''}`,
      // Las tres cifras salen de tres datasets: estados (Capítulo IV), «ya existían en 2006» (padrón) y «ni un mes» (mensual).
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía, Capítulo IV – Pozos'), dataset(R, 'padron', 'padrón de primera producción'),
        dataset(R, 'mensual', 'producción mensual por pozo')],
      // «ex YPF» no va en el epígrafe: que la planta haya sido de YPF no está en los datos ni tiene fuente (30/09).
      foto: fotoPropia('paso-3', 'Vista aérea de una planta con tanques blancos con el logo de PECOM, oficinas y un estacionamiento, rodeada por la meseta', 'Planta deshidratadora de PECOM en Kilómetro 9.'),
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      // Texto de los autores (03/10). «Todos sus pozos»: ypf_pozos_actual = 0. Los pozos sin empresa no eran de YPF (243 sin
      // operadora anterior y 8 de OMYS): por eso van en una oración aparte, sin un conector que sugiera que quedaron huérfanos.
      id: 4, kicker: 'Paso 4 · Operadoras', cifra: fmt(c.ypf_pozos_listado_anterior),
      titulo: 'pozos de YPF cambiaron de manos',
      texto: `Entre 2024 y 2026 YPF se retiró de la cuenca (Proyecto Andes). Hoy ${c.ypf_pozos_actual === 0 ? 'todos sus pozos están en nuevas manos:' : 'sus pozos figuran a nombre de'} PECOM, Patagonia Resources, Clear, Quintana, Roch y otras. Además, ${fmt(c.sin_empresa.total)} pozos no tienen ninguna empresa asignada y ${fmt(c.sin_empresa.Abandonado)} de ellos están abandonados.`,
      fuente: [dataset(R, 'listado_operadoras', 'Secretaría de Energía'), { t: 'YPF, Form 20-F 2024 (SEC)', url: CONTEXTO.ypf20F }, { t: 'Decreto Chubut 1509/2024', url: CONTEXTO.decreto1509 },
        { t: 'YPF, Form 6-K del 19/2/2026 (SEC)', url: CONTEXTO.ypf6K2026 }],
      foto: fotoPropia('paso-4', 'Letras metálicas de YPF sobre una base despintada, entre yuyos, frente a galpones abandonados', 'Letras de YPF en la entrada de sus antiguos almacenes, en Km 3.'),
      vista: { center: [-68.3, -46.2], zoom: 7 },
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, poblacion: false, limites: false, pais: false, concesiones: true, barrios: false },
      // TODO semana 3: colorear por operadora con animación antes/después (ver docs/plans).
    },
    {
      id: 5, kicker: 'Paso 5 · Ejido', cifra: fmt(e.total),
      titulo: 'pozos dentro del ejido de Comodoro Rivadavia',
      // "Producen" = extracción efectiva; "activos" incluye inyección y reparación. Población: solo los radios de Comodoro.
      texto: `De los ${fmt(e.Activo)} pozos clasificados como activos, solo ${fmt(e.extraccion_efectiva)} producen. Otros ${fmt(e.Abandonado)} están abandonados. En total, ${fmt(p.comodoro.pobl_en_radios_con_pozo)} personas -el ${pct(p.comodoro.pobl_en_radios_con_pozo_pct)} % de la población de Comodoro- viven en un radio censal con al menos un pozo.${t ? ` Además, ${fmt(t.ejido_nunca_en_serie)} pozos en el ejido no registran un solo mes de producción desde ${t.cobertura.desde.slice(0, 4)}.` : ''}`,
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), dataset(R, 'radios_censo', 'Municipalidad de Comodoro Rivadavia, Censo 2022')],
      // El SM-549 figura «Activo» (extracción efectiva), pero CRI no lo declara desde 12/2022: el epígrafe no dice que produzca.
      foto: fotoPropia('paso-5', 'Aparato de bombeo cercado con alambre, con el mar y los acantilados detrás', 'Pozo CFP.Ch.SM-549, en Caleta Córdova.'),
      vista: { center: [-67.55, -45.85], zoom: 10.3 },
      // Toda la cuenca, con los pozos fuera del ejido atenuados: la ciudad es el foco (plan 2.3).
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarEjido: true, poblacion: true, limites: true, pais: false, concesiones: false, barrios: false },
    },
    {
      // Zona norte (texto de los autores del 27/09): los 36 barrios al norte del cerro Chenque según el municipio.
      // Población del CSV municipal por barrio (Censo 2022). El Pozo N° 2 cae en General Mosconi (resumen: barrio_pozo_2).
      id: 6, kicker: 'Paso 6 · Zona norte', cifra: `${Z.barrios_con_pozos} de ${Z.barrios}`,
      titulo: 'barrios al norte del cerro Chenque tienen pozos dentro',
      // Texto de los autores (01/10 y 03/10). «Varios» y no «casi todos»: con fuente oficial, Astra y Km 5 (docs/investigacion-contexto.md).
      // «El barrio donde se encontró el petróleo»: el Pozo N° 2 (idpozo 121014) cae en General Mosconi (zona_norte.barrio_pozo_2).
      texto: `En conjunto, dentro de sus límites hay ${fmt(Z.pozos.total)} pozos: ${fmt(Z.pozos.Abandonado)} están abandonados y ${fmt(Z.pozos.Activo)} activos. El ${pct(Z.pobl_en_barrios_con_10_o_mas_pct)} % de sus habitantes vive en un barrio con diez o más pozos. Varios de estos barrios nacieron como campamentos petroleros.${astra.total > astra.poblacion ? ` En Astra hoy hay más pozos que habitantes: ${fmt(astra.total)} frente a ${fmt(astra.poblacion)}.` : ''} Y en General Mosconi (Km 3), el barrio donde se encontró el petróleo, existen ${fmt(mosconi.total)} pozos.`,
      // Las fuentes de Astra, Km 5 y Mosconi (Km 3) quedan en la metodología (decisión de los autores: no engordar la tarjeta).
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), { t: 'Municipalidad de Comodoro Rivadavia, Relevamiento de barrios', url: CONTEXTO.zonaNorte },
        dataset(R, 'poblacion_barrios', 'Censo 2022 por barrio')],
      foto: fotoPropia('paso-6', 'Vista aérea de un aparato de bombeo cercado en un descampado de tierra, rodeado de casas', 'Pozo PCR.Ch.B-41, en un descampado rodeado de casas del barrio Gobernador Fontana.'),
      vista: { bounds: NUCLEO_ZONA_NORTE },
      focoArriba: true,
      marcador: { idpozo: 121014, etiqueta: 'Pozo N° 2 · 1907' }, // se destaca; el resto de los pozos sigue a la vista
      // Toda la cuenca, con los pozos fuera de los barrios de zona norte atenuados y el contorno de esos barrios.
      capas: { estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarZonaNorte: true, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false },
    },
    {
      // Convivir con pozos (autores, 28/09): retoma los abandonados del ejido de la tarjeta 5 y cuenta historias de pozos puntuales.
      // Cada historia cita su fuente (diario o comunicado oficial); el pozo de cada caso lo confirmaron los autores
      // (docs/investigacion-contexto.md). Las cifras de las historias son citas de esas fuentes; lo que dice el registro de cada
      // pozo lo agrega la ficha. Todas salvo la del BV-577(d), que produce, son de pozos que figuran como abandonados en el Capítulo IV.
      // La del CH-182 no salió en medios: sale del Decreto 135/2025, del plano municipal y de la imagen satelital. Texto de los autores.
      // Fotos (03/10): de los autores, sin crédito (las tomas aéreas son de ellos), salvo la 7 y la 8, de las gacetillas de la
      // Municipalidad (de uso libre citando la fuente). El epígrafe dice el lugar; no se marca ninguna propiedad (privacidad).
      id: 7, kicker: 'Paso 7 · Convivir con pozos', cifra: fmt(e.Abandonado),
      titulo: 'pozos abandonados en el ejido de Comodoro Rivadavia',
      texto: 'Pero que un pozo figure como «abandonado» no garantiza que esté bien sellado. Y los riesgos no terminan ahí: también hay incidentes en pozos activos. Estas son algunas historias documentadas en medios y fuentes oficiales; te invitamos a descubrirlas.',
      historias: [
        // Tres pozos (R-87, R-88 y S/L-564, confirmados por los autores). La Nación, del momento, da mayo de 2002; Jornada y
        // El Patagónico 2015 dicen 2001 (el registro, con los abandonos declarados en junio y julio de 2002, apoya 2002).
        // Texto de los autores (29/09): «mal sellados» va sin atribución por decisión de ellos (lo dice El Patagónico, 18/3/2015).
        { idpozo: [92810, 92730, 70082], titulo: 'Una escuela sobre tres pozos', lugar: 'Stella Maris', cuando: '2002 a 2011',
          texto: 'El edificio, inaugurado en 1994, debió ser evacuado en 2002 por fuertes olores a gas. Las inspecciones revelaron que la escuela había sido construida sobre tres antiguos pozos petroleros mal sellados. Unos 400 alumnos fueron trasladados al CeRET, al Deán Funes y a la vecinal del Stella Maris. Repsol YPF realizó los trabajos de sellado. La comunidad educativa no pudo volver a ese edificio y recién en diciembre de 2011 inauguró una nueva sede.',
          fuente: [{ t: 'La Nación, 27/5/2002', url: 'https://www.lanacion.com.ar/sociedad/peligro-bajo-tierra-en-comodoro-rivadavia-nid399990/' },
            { t: 'El Patagónico, 7/12/2011', url: 'https://www.elpatagonico.com/inauguraron-el-nuevo-edificio-la-escuela-169-el-stella-maris-n1411164' },
            { t: '18/3/2015', url: 'https://www.elpatagonico.com/la-escuela-que-se-construyo-tres-pozos-petroleros-que-no-habian-sido-sellados-n773657' }],
          foto: fotoHistoria('historia-1-escuela', 'Vista aérea de un galpón de chapa con techo celeste junto a una avenida, con la costa al fondo', 'Toma aérea del edificio donde funcionaba la Escuela 169, en Stella Maris.') },
        { idpozo: 120614, titulo: 'Once familias fuera de sus casas', lugar: 'Próspero Palazzo', cuando: '2008',
          texto: 'En marzo de 2008 surgió petróleo en una vivienda de Juan José Paso y Manuel de Sarratea. Unas once familias tuvieron que dejar sus casas y la Justicia civil autorizó el desalojo. Repsol selló el pozo, que según la nota estaba inactivo desde 1991.',
          fuente: [{ t: 'El Patagónico, 20/3/2008', url: 'https://www.elpatagonico.com/por-la-surgencia-petroleo-viviendas-palazzo-once-familias-fueron-evacuadas-n1320746' },
            { t: '23/3/2008', url: 'https://www.elpatagonico.com/imponente-maquinaria-trabaja-la-casa-palazzo-donde-broto-petroleo-n1320952' }],
          foto: fotoHistoria('historia-2-paso-sarratea', 'Vista aérea de un barrio de casas bajas; a la derecha, un loteo con viviendas nuevas', 'Toma aérea de Juan José Paso y Manuel de Sarratea, en Próspero Palazzo.') },
        // YPF.Ch.-811 (identificado por los autores el 03/10, antes figuraba el CH-2228): la nota ubica la válvula en el «Lote 5» y
        // el 811 cae en el lote 5 de la manzana 9 del plano de catastro, en Laprida. La vecinal hablaba del «2.811», que no existe
        // en el Capítulo IV. Las imágenes satelitales de 2008 y 2026 muestran los lotes nuevos junto al pozo.
        { idpozo: 121741, titulo: 'Un lote con una válvula', lugar: 'Laprida', cuando: '2009',
          texto: 'En diciembre de 2008 el municipio entregó lotes en Laprida y en uno estaba la válvula de este pozo. «No podemos avanzar en la construcción, ni en la instalación de servicios», reclamaba la vecinal.',
          fuente: [{ t: 'El Patagónico, 1/4/2009', url: 'https://www.elpatagonico.com/en-laprida-se-quejan-porque-les-entregaron-terrenos-un-pozo-petroleo-abierto-n1345550' }],
          foto: fotoHistoria('historia-3-laprida', 'Vista aérea de casas sobre la ladera de un cerro con vegetación', 'Toma aérea de los lotes de Laprida, al pie del cerro.') },
        { idpozo: 121051, titulo: 'Un pozo en el patio', lugar: 'Km 3', cuando: '2010 a 2024',
          texto: 'En 2010, los departamentos de una propiedad de la calle Buque La Plata estaban desocupados por las emanaciones de gas del pozo. En 2022 la Cámara de Apelaciones le ordenó a YPF abandonarlo de nuevo, en forma definitiva. En 2024 el municipio volvió «ante la preocupación de los vecinos».',
          fuente: [{ t: 'El Patagónico, 18/12/2010', url: 'https://www.elpatagonico.com/intiman-ypf-un-pozo-abandonado-el-patio-su-casa-n1387155' },
            { t: 'ADNSUR, 22/5/2022', url: 'https://www.adnsur.com.ar/sociedad/alertan-por-un-viejo-pozo-petrolero-potencialmente--explosivo--que-esta-en-km-3-e-intiman-a-ypf-al-reabandono-_a6286a726ad27edc439d29c52' },
            { t: 'Municipalidad, 13/6/2024', url: 'https://www.comodoro.gov.ar/2024/06/13/el-municipio-realizo-fuertes-controles-en-yacimientos-para-relevar-los-pasivos-ambientales/' }],
          foto: fotoHistoria('historia-4-buque-la-plata', 'Vista aérea de un barrio de casas bajas con el mar al fondo; adelante, un edificio de techo negro', 'Toma aérea de las calles Buque Fray Luis Beltrán y Buque La Plata, en General Mosconi.') },
        { idpozo: 120200, titulo: 'Olor a gas en Las Orquídeas', lugar: 'Km 5', cuando: '2011',
          texto: 'Vecinos de Los Ferroviarios y Juan Zabalo sentían olor a gas. Camuzzi descartó que viniera de sus caños y avisó a la Secretaría de Hidrocarburos. El pozo, abandonado por YPF en 1968, se volvió a abandonar en marzo de 2011, con dos calles cortadas.',
          fuente: [{ t: 'El Patagónico, 27/2/2011', url: 'https://www.elpatagonico.com/una-surgencia-gas-mantiene-vilo-al-barrio-las-orquideas-n1391649' },
            { t: '31/3/2011', url: 'https://www.elpatagonico.com/cortaron-dos-calles-sellar-el-pozo-petrolero-kilometro-5-n1393660' }],
          foto: fotoHistoria('historia-5-ferroviarios-zabalo', 'Carteles de las calles Los Ferroviarios y Juan Zabalo contra un cielo con nubes', 'Los Ferroviarios y Juan Zabalo, en Las Orquídeas.') },
        // CH-182: Decreto 135/2025 (rechaza el recurso de YPF contra la Res. 23-15-MH del 29/10/2015); la rotonda, del plano
        // municipal y de la imagen de Google Earth (3/2026).
        { idpozo: 121188, titulo: 'Un pozo en la rotonda', lugar: 'Presidente Ortiz', cuando: '2015 a 2025',
          texto: 'Cuando el Sindicato de Petróleo y Gas Privado solicitó a YPF tierras para una urbanización de 600 lotes, el pozo YPF.Ch.-182 tenía un radio de seguridad de 60 metros. En 2015, el Ministerio de Hidrocarburos de Chubut redujo ese perímetro a 5 metros y le exigió a YPF la presentación de un plan de contingencia anual. La empresa recurrió la medida: sostuvo que el pozo, por su ubicación, «no podría en ningún caso generar daños a bienes o a personas». La Provincia rechazó el recurso en 2025. Hoy, el pozo se encuentra en medio de una rotonda del barrio.',
          fuente: [{ t: 'Decreto Chubut 135/2025', url: CONTEXTO.decreto135 }, { t: 'plano de la Municipalidad de Comodoro Rivadavia' }, { t: 'Google Earth, 3/2026' }],
          foto: fotoHistoria('historia-6-rotonda', 'Vista aérea de una rotonda con calles nuevas, postes de luz y lotes casi vacíos', 'Toma aérea de la rotonda del loteo, en Presidente Ortiz.') },
        { idpozo: 161850, titulo: 'Un derrame en el Cañadón La Francesa', lugar: 'Bella Vista', cuando: '2024',
          texto: 'En junio de 2024 se rompió la línea de conducción de este pozo, que hoy produce. Se derramaron 14 m³ de crudo a lo largo de unos 600 metros, sobre vegetación y lotes de vecinos. La Provincia multó a YPF con el equivalente a 224.000 litros de gasoil.',
          fuente: [{ t: 'El Chubut, 5/7/2024', url: 'https://www.elchubut.com.ar/regionales/2024-7-5-21-35-0-provincia-sanciono-a-ypf-por-el-derrame-de-hidrocarburos-en-bella-vista' },
            { t: 'El Extremo Sur, 11/7/2024', url: 'https://www.elextremosur.com/nota/49898-derrames-y-pozos-abandonados-a-la-vuelta-de-la-esquina-una-ciudad-que-crecio-de-la-mano-del-petroleo/' }],
          foto: fotoHistoria('historia-7-la-francesa', 'Un camino de tierra con una mancha de petróleo; al fondo, pinos y cerros nevados', 'El derrame en el Cañadón La Francesa. Foto: Municipalidad de Comodoro Rivadavia.') },
        { idpozo: 121621, titulo: 'Una surgencia camino a Laprida', lugar: 'Zona Central', cuando: '2024',
          texto: 'El 25 de agosto de 2024 salió petróleo de este pozo, perforado en 1927 y abandonado «aparentemente en 1962», según el municipio. El derrame afectó el suelo y parte del arroyo Belgrano. El municipio le pidió a YPF, por acta, estudios de integridad y hermeticidad.',
          fuente: [{ t: 'Municipalidad, 27/8/2024', url: CONTEXTO.municipioCH679 }],
          foto: fotoHistoria('historia-8-arroyo-belgrano', 'Dos personas con casco al borde de un arroyo de agua turbia, entre arbustos', 'El arroyo Belgrano después de la surgencia. Foto: Municipalidad de Comodoro Rivadavia.') },
        { idpozo: 121326, titulo: 'Cuando un pozo apareció dentro de una casa', lugar: 'Sismográfica', cuando: '2026',
          texto: 'Tras el deslizamiento del cerro Hermitte, en la casa de un vecino «un pozo petrolero emergió del suelo, rompió su piso». Esos días se evacuaron más de 90 familias del sector. La Provincia sostuvo que la actividad petrolera no causó el deslizamiento.',
          fuente: [{ t: 'Diario Jornada, 21/1/2026', url: 'https://www.diariojornada.com.ar/409911/magazine/derrumbe_emergio_un_pozo_petrolero_dentro_de_su_casa' },
            { t: 'El Chubut, 10/2/2026', url: 'https://www.elchubut.com.ar/regionales/2026-2-10-21-55-0-cerro-hermitte-aseguran-que-la-actividad-petrolera-no-fue-el-origen-de-los-deslizamientos' }],
          foto: fotoHistoria('historia-9-sismografica', 'Casas al pie de un cerro con laderas de tierra desmoronada; algunas, dañadas por el deslizamiento', 'Sismográfica, al pie del cerro Hermitte: se ven viviendas dañadas por el deslizamiento.') },
        { idpozo: 121660, titulo: 'Petróleo al plantar un árbol', lugar: 'Km 5', cuando: '2026',
          texto: 'Un vecino de la calle Ferrocarriles Argentinos cavaba en su patio para plantar un árbol y, a un metro diez de profundidad, empezó a salir petróleo. «Ya nos había pasado otras veces», contó.',
          fuente: [{ t: 'ADNSUR, 27/2/2026', url: 'https://www.adnsur.com.ar/sociedad/cavaba-un-pozo-en-su-patio-de-la-zona-norte-de-comodoro-y-se-encontro-con-petroleo_a69a227fe66a78182fdf02017' }],
          foto: fotoHistoria('historia-10-ferrocarriles-argentinos', 'Vista aérea de una esquina con una plaza, casas y edificios de colores', 'Toma aérea de las calles Ferrocarriles Argentinos y Ferrocarril Patagónico, en Presidente Ortiz.') },
      ],
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), 'historias: cada una cita su fuente'],
      vista: { bounds: NUCLEO_ZONA_NORTE },
      focoArriba: true,
      // Mismo encuadre que la tarjeta 6, pero solo los abandonados (como la cifra), con los de fuera del ejido atenuados;
      // encima, los marcadores de las historias.
      capas: { estadosVisibles: new Set([3]), empresa: null, yacimiento: null, provincia: null, soloEjido: false, enfocarEjido: true, poblacion: false, limites: true, pais: false, concesiones: false, barrios: false },
    },
    {
      // Cierre (autores, 28/09): vuelve al Pozo N° 2 y se aleja despacio hasta la cuenca (sin apagar ningún estado: decisión de
      // los autores). Texto final de los autores (01/10): «entre las casas» es decisión de ellos (lo muestran el satélite y las
      // historias del paso 7); salió «No hay un registro público…», que no tenía fuente en la tarjeta.
      // Los datos de la versión anterior (13.018 parados hace más de 5 años, ritmo de abandonos, provisión de YPF) siguen en
      // resumen.json y en la conciliación.
      id: 8, kicker: 'Paso 8 · Lo que queda', cifra: fmt(c.sin_produccion),
      titulo: 'pozos sin producir en la cuenca',
      texto: 'En 1907 se buscaba agua y se encontró petróleo. A partir de aquel hallazgo nacieron campamentos, crecieron barrios y la ciudad se expandió a su alrededor. Hoy la cuenca produce cada vez menos y muchos de esos pozos quedaron entre las casas. El petróleo se va, pero los pozos se quedan.',
      fuente: [dataset(R, 'capitulo_iv', 'Secretaría de Energía'), { t: 'Ministerio de Economía', url: CONTEXTO.minEconomia }],
      vista: VISTA_CUENCA, // en la computadora, el mismo encuadre con el que arranca el visualizador
      comoVisualizador: true,
      focoArriba: true,
      marcador: { idpozo: 121014, etiqueta: 'Pozo N° 2 · 1907' },
      foto: {
        src: `${import.meta.env.BASE_URL}img/bombeo-atardecer.jpg`,
        alt: 'Un aparato de bombeo petrolero, cercado, en un campo seco bajo un cielo cargado de atardecer; al fondo, un cerro',
        credito: 'Foto: Mauro Esains.',
      },
      // La cámara arranca cerca del Pozo N° 2 (zoom) y se aleja durante `duracion` ms hasta la vista del paso.
      cierre: { zoom: 14, duracion: 7000 },
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
        ${s.historias ? `<p class="acciones-historias"><button type="button" class="empezar" data-historia="0">Leer las ${s.historias.length} historias <span aria-hidden="true">→</span></button></p>` : ''}
        ${s.final ? `<div class="acciones-cierre">
          <button type="button" class="empezar" data-ir="explorar">Explorá el mapa</button>
          <button type="button" class="empezar" data-abrir="metodologia">Metodología</button>
        </div>` : ''}
        <p class="fuente">Fuente: ${htmlFuente(s.fuente, s.fuenteSep)}</p>
      </div>`;
    cont.appendChild(sec);
  }
  if (produccion) dibujarProduccion(document.getElementById('grafico-cuencas'), produccion);

  let turno = 0; // sube en cada entrada a un paso y en la pausa: una secuencia de cierre vieja no sigue
  function entrar(seccion) {
    const miTurno = ++turno;
    const id = Number(seccion.dataset.step);
    // Volver a entrar sin haber salido: scrollama lo hace al cambiar el tamaño de la ventana (en el celular, cuando se
    // esconde la barra de direcciones) y reanudar() al volver del visualizador. El cierre no arranca de nuevo.
    const yaEstaba = seccion.classList.contains('activa');
    document.querySelectorAll('#story .step').forEach((el) => el.classList.toggle('activa', el === seccion));
    const paso = pasos.find((p) => p.id === id);
    if (!paso) { // portada: el país, sin ningún pozo
      mapa.marcador(null);
      mapa.historias(null);
      document.body.classList.add('sin-leyenda'); // sin pozos en el mapa, la leyenda no tiene qué explicar
      mapa.aplicar({ soloId: null, pozos: false, soloEjido: false, enfocarEjido: false, enfocarZonaNorte: false, poblacion: false, limites: false, pais: false, concesiones: false, barrios: false, satelite: false });
      mapa.volar({ center: [-66.5, -41.5], zoom: 4.3 });
      return;
    }
    // Cada paso define su vista completa: los filtros que se hayan tocado en el panel no se arrastran.
    mapa.aplicar({ soloId: null, enfocarEjido: false, enfocarZonaNorte: false, sinProducir: null, barrio: null, satelite: false, pozos: true, ...paso.capas });
    document.body.classList.toggle('sin-leyenda', Boolean(paso.capas.soloId)); // un solo pozo: la leyenda cuenta 44.390
    mapa.marcador(paso.marcador?.idpozo ?? null, paso.marcador?.etiqueta);
    mapa.historias(paso.historias ? paso.historias.map((h) => ({ idpozo: pozosDe(h)[0], etiqueta: `${h.titulo} · ${h.cuando}` })) : null);
    if (paso.historias) precargarFotos(paso.historias);
    const vista = (paso.historias && vistaDeHistorias(paso.historias)) || paso.vista;
    // Lo que tapa la tarjeta: en celular, la mitad de abajo (focoArriba); en escritorio, una vista por límites
    // (vista.bounds) deja libre la columna de la tarjeta.
    let padding;
    if (MOVIL.matches) {
      // Con vista por límites también se dejan libres la franja de la leyenda (arriba) y toda la altura de la tarjeta.
      const porLimites = Boolean(vista.bounds);
      const arriba = porLimites ? Math.round(document.getElementById('leyenda').getBoundingClientRect().bottom) + 8 : 0;
      // tope: el mapa conserva al menos el 38 % de la pantalla (si no, con una tarjeta alta se aleja de más)
      const abajo = Math.min(window.innerHeight * 0.62, Math.max(window.innerHeight * 0.45, porLimites ? seccion.querySelector('.card').offsetHeight + 16 : 0));
      if (paso.focoArriba) padding = { top: arriba, bottom: Math.round(abajo), left: 0, right: 0 };
      // con historias, aire para que los íconos de los bordes no queden cortados
      if (padding && paso.historias) padding = { top: padding.top + AIRE_ICONO / 2, bottom: padding.bottom + AIRE_ICONO / 2, left: AIRE_ICONO / 2, right: AIRE_ICONO / 2 };
    } else if (paso.comoVisualizador) {
      padding = paddingPanel(); // mismo encuadre que el visualizador: el mapa no se mueve al pasar a él
    } else if (vista.bounds) {
      const tarjeta = seccion.querySelector('.card').getBoundingClientRect();
      padding = { top: 24, bottom: 24, left: Math.round(tarjeta.right) + 24, right: 24 };
      if (paso.historias) {
        // Tarjeta 7: los pozos de las historias lo más cerca posible, con el aire justo para los íconos, y sin pasar por
        // debajo de la leyenda (se le reserva su columna, a la derecha: ocupa solo la esquina de arriba).
        const ley = document.getElementById('leyenda').getBoundingClientRect();
        padding = { top: AIRE_ICONO, bottom: AIRE_ICONO, left: Math.round(tarjeta.right) + AIRE_ICONO,
          right: ley.width ? Math.round(window.innerWidth - ley.left) + 16 : AIRE_ICONO };
      }
    }
    const opciones = { ...(paso.vuelo || {}), ...(padding ? { padding } : {}) };
    if (paso.cierre) recorrerCierre(paso, opciones, seccion, miTurno, yaEstaba);
    else mapa.volar(vista, opciones);
  }

  // Tarjeta 7: el encuadre abarca justo los pozos de las historias (el aire para los íconos lo pone el padding, en píxeles).
  // Sin los pozos cargados todavía, queda la vista del paso.
  function vistaDeHistorias(lista) {
    const c = lista.map((h) => mapa.coordsDe(pozosDe(h)[0])).filter(Boolean);
    if (!c.length) return null;
    const lon = c.map((p) => p[0]), lat = c.map((p) => p[1]);
    return { bounds: [[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]] };
  }

  // Cierre (tarjeta 8): la cámara va al Pozo N° 2 y se aleja despacio hasta la cuenca.
  // Con «reducir movimiento», o si ya se estaba en el paso, directo a la vista del paso.
  // Al terminar, la tarjeta queda marcada (data-cierre-listo): el visualizador arranca desde esa cámara sin moverla.
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  async function recorrerCierre(paso, opciones, seccion, miTurno, directo) {
    delete seccion.dataset.cierreListo;
    const pozo2 = mapa.coordsDe(paso.marcador.idpozo);
    if (pozo2 && !directo && !reducirMovimiento()) {
      // En la computadora el pozo queda a la derecha de la tarjeta; en el celular, arriba (el mismo padding del paso).
      const tarjeta = seccion.querySelector('.card').getBoundingClientRect();
      const padding = MOVIL.matches ? opciones.padding : { top: 24, bottom: 24, left: Math.round(tarjeta.right) + 24, right: 24 };
      await mapa.volar({ center: pozo2, zoom: paso.cierre.zoom }, { duration: 2000, padding });
      if (miTurno !== turno) return;
      await espera(900);
      if (miTurno !== turno) return;
      await mapa.volar(paso.vista, { ...opciones, duration: paso.cierre.duracion });
    } else {
      await mapa.volar(paso.vista, opciones);
    }
    if (miTurno === turno) seccion.dataset.cierreListo = '';
  }

  // ---- historias (tarjeta 7): los pozos marcados en el mapa y el botón de la tarjeta abren la misma ventana ----
  // (<dialog id="ventana-historia"> de index.html, con el estilo de la de Metodología; se cierra con ×, Escape o clic afuera).
  const pasoHistorias = pasos.find((p) => p.historias);
  const ventana = document.getElementById('ventana-historia');
  let actual = null;   // índice de la historia abierta
  let origen = null;   // quién la abrió (el foco vuelve ahí al cerrar)
  // Las fotos de las historias (~350 KB en WebP) se piden al llegar a la tarjeta, una sola vez: al abrir la ventana ya están.
  let precargadas = null;
  function precargarFotos(lista) {
    if (precargadas) return;
    precargadas = lista.filter((h) => h.foto).map((h) => {
      const im = new Image();
      im.src = h.foto.src.replace(/\.jpg$/, '.webp');
      return im;
    });
  }
  function abrirHistoria(i) {
    const lista = pasoHistorias.historias;
    const h = lista[i];
    if (!h || !ventana) return;
    if (!ventana.open) origen = document.activeElement;
    actual = i;
    const $v = (sel) => ventana.querySelector(sel);
    $v('#historia-meta').textContent = `${i + 1} de ${lista.length} · ${h.lugar} · ${h.cuando}`;
    $v('#historia-titulo').textContent = h.titulo;
    // Foto: solo si la historia tiene una cargada, con permiso de quien la sacó (crédito obligatorio). WebP con JPEG de
    // respaldo, como las del paso 1 y la portada; el recorte 16:9 lo hace el CSS (posicion = object-position).
    // Imagen nueva en cada historia: si se reusara la misma, la foto anterior seguiría a la vista hasta que cargue la nueva.
    const fig = $v('.historia-foto');
    fig.hidden = !h.foto;
    if (h.foto) {
      const [ancho, alto] = h.foto.proporcion || [1000, 562];
      const estilo = [h.foto.posicion && `object-position: ${h.foto.posicion}`, h.foto.proporcion && `aspect-ratio: ${ancho} / ${alto}`].filter(Boolean).join('; ');
      fig.querySelector('picture').innerHTML = `<source srcset="${h.foto.src.replace(/\.jpg$/, '.webp')}" type="image/webp">`
        + `<img src="${h.foto.src}" alt="${esc(h.foto.alt)}" width="${ancho}" height="${alto}"${estilo ? ` style="${estilo}"` : ''}>`;
      fig.querySelector('figcaption').textContent = h.foto.credito;
    } else {
      fig.querySelector('picture').innerHTML = '';
    }
    $v('#historia-texto').textContent = h.texto;
    $v('#historia-fuente').innerHTML = `Fuente: ${htmlFuente(h.fuente, ', ')}`;
    const reg = $v('#historia-registro');
    reg.textContent = '';
    // Lo que dice el registro de esos pozos (Capítulo IV): estado declarado y años, si los hay. Con varios pozos (la Escuela 169
    // tiene tres), los que comparten años van juntos: «R-87 y R-88: perforados en 1978, abandono declarado en 2002».
    Promise.all(pozosDe(h).map(cargarFicha)).then((fichas) => {
      if (actual !== i || fichas.some((f) => !f)) return;
      const anios = (f) => [f.fperf && `perforado en ${f.fperf.slice(0, 4)}`, f.fab && `abandono declarado en ${f.fab.slice(0, 4)}`].filter(Boolean).join(', ');
      const estados = enLista([...new Set(fichas.map((f) => f.est))]);
      if (fichas.length === 1) {
        reg.textContent = `En el registro: ${[`Pozo ${fichas[0].s}`, `${estados}, según lo declarado por la operadora`, anios(fichas[0])].filter(Boolean).join(' · ')}.`;
        return;
      }
      const grupos = new Map(); // años → siglas
      for (const f of fichas) if (anios(f)) grupos.set(anios(f), [...(grupos.get(anios(f)) || []), f.s]);
      const detalle = [...grupos].map(([t, siglas]) => `${enLista(siglas)}: ${siglas.length > 1 ? t.replace('perforado', 'perforados') : t}`);
      reg.textContent = `En el registro: ${[`Pozos ${enLista(fichas.map((f) => f.s))}`, `${estados}, según lo declarado por la operadora`, ...detalle].join(' · ')}.`;
    }).catch(() => {});
    // En la primera no hay «Anterior» y en la última «Siguiente» dice «Cerrar» (cierra como la ×). Si el foco estaba en
    // «Anterior», pasa a «Siguiente» antes de ocultarlo: un botón oculto con el foco lo deja perdido en la página.
    const anterior = $v('[data-historia-paso="-1"]'), siguiente = $v('[data-historia-paso="1"]');
    if (i === 0 && document.activeElement === anterior) siguiente.focus();
    anterior.hidden = i === 0;
    siguiente.textContent = i === lista.length - 1 ? 'Cerrar' : 'Siguiente →';
    mapa.resaltarHistoria(i);
    if (!ventana.open) ventana.showModal();
    $v('.ventana-cuerpo').scrollTop = 0;
  }
  if (pasoHistorias && ventana) {
    cont.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-historia]');
      if (b) abrirHistoria(Number(b.dataset.historia));
    });
    mapa.alTocarHistoria((i) => abrirHistoria(i));
    ventana.addEventListener('click', (ev) => {
      if (ev.target === ventana || ev.target.closest('[data-cerrar-historia]')) { ventana.close(); return; } // clic afuera o ×
      const paso = ev.target.closest('[data-historia-paso]');
      if (!paso) return;
      const destino = actual + Number(paso.dataset.historiaPaso);
      if (destino < pasoHistorias.historias.length) abrirHistoria(destino);
      else ventana.close(); // la última: el botón dice «Cerrar»
    });
    ventana.addEventListener('close', () => {
      actual = null;
      mapa.resaltarHistoria(null);
      if (origen && document.contains(origen)) origen.focus({ preventScroll: true });
    });
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
    pausar() { pausado = true; turno++; scroller.disable(); },
    /** Al volver del visualizador: vuelve a escuchar y reaplica el paso que quedó en pantalla. */
    reanudar() { pausado = false; scroller.enable(); entrar(pasoEnPantalla()); },
  };
}

const MOVIL = window.matchMedia('(max-width: 700px)');
const AIRE_ICONO = 44; // px: el ícono de una historia con su halo, para que no quede cortado en el borde del encuadre
