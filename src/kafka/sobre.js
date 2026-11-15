'use strict';

const { randomUUID } = require('node:crypto');

// Sobre común de los mensajes del ecosistema (docs/08-contrato-tres-topicos.md §2 del orquestador).
// Los eventos no llevan `destino`: solo los comandos.
function armarSobre(eventType, payload, correlationId, ahora = new Date()) {
  const fecha = ahora.toISOString();
  return {
    eventId: randomUUID(),
    eventType,
    version: 1,
    occurredAt: fecha,
    timestamp: fecha,
    correlationId: correlationId || randomUUID(),
    payload,
  };
}

// Lee un mensaje de Kafka. Devuelve null si no es un sobre legible (no es JSON o no es un objeto con `eventType`).
function leerSobre(valor) {
  let mensaje;
  try {
    mensaje = JSON.parse(Buffer.isBuffer(valor) ? valor.toString('utf8') : String(valor));
  } catch {
    return null;
  }
  if (mensaje === null || typeof mensaje !== 'object' || Array.isArray(mensaje)) return null;
  if (typeof mensaje.eventType !== 'string') return null;
  return mensaje;
}

module.exports = { armarSobre, leerSobre };
