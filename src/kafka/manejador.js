'use strict';

const { ErrorValidacionPatente, ErrorSitioNoDisponible, ErrorEstructuraNoReconocida } = require('../errors');
const { armarSobre, leerSobre } = require('./sobre');

const COMANDO = 'ConsultarMultas';
const MULTAS_CONSULTADAS = 'MultasConsultadas';
const CONSULTA_FALLIDA = 'ConsultaMultasFallida';

// Cómo se informa cada error de la consulta (docs/08 §4): si el orquestador debe reintentar o no.
function traducirError(err) {
  if (err instanceof ErrorSitioNoDisponible) return { motivo: 'SITIO_NO_DISPONIBLE', reintentable: true };
  if (err instanceof ErrorEstructuraNoReconocida) return { motivo: 'ESTRUCTURA_NO_RECONOCIDA', reintentable: false };
  if (err instanceof ErrorValidacionPatente) return { motivo: 'PATENTE_INVALIDA', reintentable: false };
  return null; // un error inesperado: se reintenta acá y, si persiste, va a la DLT
}

/**
 * Atiende un mensaje de `crm.comandos`.
 *
 * - Ignora lo que no es `ConsultarMultas` con `destino: multas`.
 * - Responde en `crm.eventos` con `MultasConsultadas` o `ConsultaMultasFallida` (mismo correlationId, clave vehiculoId).
 *   Una patente sin multas es un resultado válido. Los errores conocidos del sitio se informan, no se reintentan acá:
 *   el orquestador decide los reintentos y su espera.
 * - Un error inesperado, o no poder publicar la respuesta, se reintenta (`reintentos` veces, con espera creciente) y
 *   después el comando va a la DLT tal como llegó. La consulta no se repite si solo falló la publicación.
 * - El log no lleva patente, actas ni importes (datos personales).
 *
 * Dependencias inyectadas: consultar(patente), publicarEvento(clave, sobre), publicarDlt(clave, valor),
 * dormir(ms) y log(nivel, texto).
 */
async function atenderComando({ clave, valor }, deps, config) {
  const { consultar, publicarEvento, publicarDlt, dormir, log } = deps;
  const mensaje = leerSobre(valor);
  if (mensaje === null) {
    log('warn', 'Mensaje ilegible en crm.comandos: se manda a la DLT.');
    await publicarDlt(clave, valor);
    return 'dlt';
  }
  if (mensaje.eventType !== COMANDO || mensaje.destino !== config.servicio) return 'ignorado';

  const payload = mensaje.payload && typeof mensaje.payload === 'object' ? mensaje.payload : {};
  const vehiculoId = typeof payload.vehiculoId === 'string' && payload.vehiculoId ? payload.vehiculoId : null;
  if (vehiculoId === null) {
    log('warn', 'ConsultarMultas sin vehiculoId: se manda a la DLT.');
    await publicarDlt(clave, valor);
    return 'dlt';
  }

  let respuesta = null; // { eventType, payload }, se calcula una sola vez
  for (let intento = 1; intento <= config.reintentos; intento += 1) {
    try {
      if (respuesta === null) respuesta = await resolver(vehiculoId, payload.patente, consultar, log);
      await publicarEvento(vehiculoId, armarSobre(respuesta.eventType, respuesta.payload, mensaje.correlationId));
      return respuesta.eventType === MULTAS_CONSULTADAS ? 'consultada' : 'fallida';
    } catch (err) {
      // Solo el tipo: el mensaje puede arrastrar detalles del sitio o de la patente.
      log('warn', `Intento ${intento}/${config.reintentos} fallido vehiculoId=${vehiculoId} tipo=${err.name}`);
      if (intento < config.reintentos) await dormir(config.esperaReintentoMs * 2 ** (intento - 1));
    }
  }
  log('error', `Se agotaron los intentos vehiculoId=${vehiculoId}: el comando va a la DLT.`);
  await publicarDlt(clave, valor);
  return 'dlt';
}

async function resolver(vehiculoId, patente, consultar, log) {
  try {
    const resultado = await consultar(patente);
    log('info', `Consulta completada vehiculoId=${vehiculoId} estado=ok actas=${resultado.infracciones.length}`);
    return {
      eventType: MULTAS_CONSULTADAS,
      payload: {
        vehiculoId,
        dominio: resultado.dominio,
        infracciones: resultado.infracciones,
        subtotal: resultado.subtotal,
        ...(resultado.mensaje ? { mensaje: resultado.mensaje } : {}),
      },
    };
  } catch (err) {
    const traducido = traducirError(err);
    if (traducido === null) throw err;
    const nivel = traducido.reintentable ? 'warn' : 'error';
    log(nivel, `Consulta fallida vehiculoId=${vehiculoId} estado=error motivo=${traducido.motivo}`);
    return { eventType: CONSULTA_FALLIDA, payload: { vehiculoId, ...traducido } };
  }
}

module.exports = { atenderComando, COMANDO, MULTAS_CONSULTADAS, CONSULTA_FALLIDA };
