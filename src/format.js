'use strict';

const { ESTADO } = require('./parse');
const { ErrorEstructuraNoReconocida } = require('./errors');

const MENSAJE_SIN_MULTAS = 'Este auto no tiene multas registradas';

/**
 * Convierte un monto en formato argentino a número.
 * "$ 1.234.567,89" -> 1234567.89 ; "39.000,00" -> 39000 ; null/vacío -> null
 */
function parseMontoArgentino(texto) {
  if (texto == null) return null;
  const limpio = String(texto).replace(/\$/g, '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

// Redondeo a centavos para evitar errores binarios en la suma de montos.
function redondearCentavos(n) {
  return Math.round(n * 100) / 100;
}

function construirActa(acta) {
  return {
    numeroActa: acta.numeroActa,
    dominio: acta.dominio,
    importe: parseMontoArgentino(acta.importeEncabezado),
    importeSinDescuento: parseMontoArgentino(acta.importeSinDescuento),
    tipoInfraccion: acta.tipoInfraccion,
    lugar: acta.lugar,
    juzgado: acta.juzgado,
  };
}

/**
 * Arma el resultado final por patente a partir del parseo.
 * - Subtotal = suma de importes sin descuento; si el acta no los informa, se usa el importe del encabezado.
 * - Patente sin actas: lista vacía, subtotal 0 y el campo `mensaje`, sin error.
 * - Estructura no reconocida: lanza ErrorEstructuraNoReconocida (nunca devuelve un subtotal).
 */
function construirResultado(dominio, parseado) {
  if (parseado.estado === ESTADO.ESTRUCTURA_NO_RECONOCIDA) {
    throw new ErrorEstructuraNoReconocida();
  }

  const infracciones = parseado.actas.map(construirActa);

  if (infracciones.length === 0) {
    return { dominio, infracciones: [], subtotal: 0, mensaje: MENSAJE_SIN_MULTAS };
  }

  const subtotal = redondearCentavos(
    infracciones.reduce((suma, a) => suma + (a.importeSinDescuento ?? a.importe ?? 0), 0)
  );

  return { dominio, infracciones, subtotal };
}

module.exports = { parseMontoArgentino, construirResultado, MENSAJE_SIN_MULTAS };
