'use strict';

const { ErrorValidacionPatente } = require('./errors');

const MAX_LARGO_PATENTE = 7;

/**
 * Valida la patente antes de tocar el sitio.
 * Reglas de la spec: rechazar vacía o con más de 7 caracteres.
 * Devuelve la patente normalizada (sin espacios, en mayúsculas).
 */
function validarPatente(entrada) {
  const normalizada = String(entrada ?? '').trim().toUpperCase();
  if (normalizada.length === 0) {
    throw new ErrorValidacionPatente('La patente no puede estar vacía.');
  }
  if (normalizada.length > MAX_LARGO_PATENTE) {
    throw new ErrorValidacionPatente(`La patente no puede tener más de ${MAX_LARGO_PATENTE} caracteres.`);
  }
  return normalizada;
}

module.exports = { validarPatente, MAX_LARGO_PATENTE };
