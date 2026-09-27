// Paleta del proyecto: "Sobria · papel". Validada para daltonismo (protan, deutan, tritan),
// separación en visión normal y contraste sobre el fondo. No cambiar sin volver a validar
// (ver docs/specs, sección 4).

export const PALETA = {
  fondo: '#f3efe7',
  urbano: '#e7e1d4',
  urbanoBorde: '#d9d2c3',
  limite: '#5a5751',
  texto: '#17181b',
  textoSec: '#5a5b5e',
  tarjeta: 'rgba(255, 252, 246, 0.94)',
};

// Orden fijo de estados: índice = estado_cod del binario (ver public/data/pozos_gsj.meta.json)
export const ESTADOS = [
  { cod: 0, nombre: 'Activo', hex: '#1f5fa8', rgb: [31, 95, 168] },
  { cod: 1, nombre: 'Inactivo', hex: '#b97a00', rgb: [185, 122, 0] },
  { cod: 2, nombre: 'A abandonar', hex: '#a3391e', rgb: [163, 57, 30] },
  { cod: 3, nombre: 'Abandonado', hex: '#7b7f88', rgb: [123, 127, 136] },
  { cod: 4, nombre: 'No informado', hex: '#c9c6bd', rgb: [201, 198, 189] },
];

// Escala de un solo tono para población por radio censal (claro → oscuro).
// Se aplica sobre el mismo azul del "activo" desaturado para no competir con los estados.
export const POBLACION_RAMPA = ['#f1ece2', '#d9d3c4', '#bdb5a2', '#9d9482', '#7a7263'];
// Cortes de la rampa (habitantes por radio censal). Los usan el mapa y la leyenda: definirlos una sola vez.
export const CORTES_POBLACION = [400, 700, 1000, 1300];

// Operadoras para el paso 3 (máximo 6 colores distinguibles; el resto "Otras").
// Pendiente de validar con el validador cuando se construya el paso 3.
export const OPERADORAS_DESTACADAS = [
  'PECOM SERVICIOS ENERGIA SAU',
  'PAN AMERICAN ENERGY SL',
  'COMPAÑÍA GENERAL DE COMBUSTIBLES S.A.',
  'COMPAÑÍAS ASOCIADAS PETROLERAS S.A.',
  'CROWN POINT ENERGIA S.A.',
];
