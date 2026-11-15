'use strict';

// Configuración del servicio de multas, leída de variables de entorno (mismos nombres que el resto del ecosistema).

// Nombre con el que el orquestador identifica a este servicio en el `destino` de los comandos.
const SERVICIO = 'multas';

const MECANISMOS_SASL = {
  PLAIN: 'plain',
  'SCRAM-SHA-256': 'scram-sha-256',
  'SCRAM-SHA-512': 'scram-sha-512',
};

function entero(valor, porDefecto, nombre) {
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nombre} tiene que ser un entero positivo (llegó "${valor}").`);
  return n;
}

function leerConfig(env = process.env) {
  const protocolo = (env.KAFKA_SECURITY_PROTOCOL || '').toUpperCase() || null;
  const mecanismo = (env.KAFKA_SASL_MECHANISM || '').toUpperCase() || null;
  if (mecanismo && !MECANISMOS_SASL[mecanismo]) {
    throw new Error(`KAFKA_SASL_MECHANISM no soportado: ${mecanismo}.`);
  }
  return {
    servicio: SERVICIO,
    brokers: (env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(',').map(b => b.trim()).filter(Boolean),
    clientId: env.KAFKA_CLIENT_ID || 'multas-microservice',
    grupo: env.KAFKA_CONSUMER_GROUP || 'multas-service',
    topicos: {
      comandos: env.KAFKA_TOPICO_COMANDOS || 'crm.comandos',
      eventos: env.KAFKA_TOPICO_EVENTOS || 'crm.eventos',
      dlt: env.KAFKA_TOPICO_DLT || 'crm.dlt',
    },
    seguridad: {
      protocolo,
      mecanismo: mecanismo ? MECANISMOS_SASL[mecanismo] : null,
      usuario: env.KAFKA_SASL_USERNAME || null,
      clave: env.KAFKA_SASL_PASSWORD || null,
      cafile: env.KAFKA_SSL_CAFILE || null,
    },
    // Intentos de procesar un comando antes de mandarlo a la DLT, y espera inicial (se duplica en cada intento).
    reintentos: entero(env.KAFKA_REINTENTOS_COMANDO, 3, 'KAFKA_REINTENTOS_COMANDO'),
    esperaReintentoMs: entero(env.KAFKA_ESPERA_REINTENTO_SEGUNDOS, 2, 'KAFKA_ESPERA_REINTENTO_SEGUNDOS') * 1000,
    // Una consulta a la vez y con esta pausa mínima entre una y otra, para no saturar a la ANSV ni que nos bloqueen.
    pausaEntreConsultasMs: entero(env.MULTAS_PAUSA_ENTRE_CONSULTAS_SEGUNDOS, 5, 'MULTAS_PAUSA_ENTRE_CONSULTAS_SEGUNDOS') * 1000,
    puerto: entero(env.PORT, 8086, 'PORT'),
  };
}

module.exports = { SERVICIO, leerConfig };
