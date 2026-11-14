'use strict';

const { validarPatente } = require('./validar');
const { buscarPorDominio } = require('./fetch');
const { parseResultados } = require('./parse');
const { construirResultado } = require('./format');

/**
 * Consulta las infracciones de una patente y devuelve el resultado estructurado.
 * { dominio, infracciones: [...], subtotal, mensaje? }
 */
async function consultarInfraccionesPorDominio(entrada, opciones = {}) {
  const dominio = validarPatente(entrada);
  const html = await buscarPorDominio(dominio, opciones);
  return construirResultado(dominio, parseResultados(html));
}

module.exports = { consultarInfraccionesPorDominio };
