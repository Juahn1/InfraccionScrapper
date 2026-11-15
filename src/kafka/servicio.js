'use strict';

const fs = require('node:fs');
const { Kafka, logLevel } = require('kafkajs');
const { atenderComando } = require('./manejador');
const { limitarConsultas } = require('./limitador');

function opcionesDeConexion(config) {
  const { protocolo, mecanismo, usuario, clave, cafile } = config.seguridad;
  const opciones = { clientId: config.clientId, brokers: config.brokers, logLevel: logLevel.WARN };
  if (protocolo && protocolo.includes('SSL')) {
    opciones.ssl = cafile ? { ca: [fs.readFileSync(cafile, 'utf8')] } : true;
  }
  if (protocolo && protocolo.includes('SASL')) {
    if (!mecanismo || !usuario || !clave) {
      throw new Error('Con SASL hacen falta KAFKA_SASL_MECHANISM, KAFKA_SASL_USERNAME y KAFKA_SASL_PASSWORD.');
    }
    opciones.sasl = { mechanism: mecanismo, username: usuario, password: clave };
  }
  return opciones;
}

/**
 * Arranca el servicio: escucha `crm.comandos` y responde en `crm.eventos` (contrato: docs/08 del orquestador).
 * Devuelve { detener, conectado }. `consultar` es la consulta a la ANSV (inyectable para pruebas).
 */
async function iniciarServicio(config, consultar, { log = () => {} } = {}) {
  const kafka = new Kafka(opcionesDeConexion(config));
  const { comandos, eventos, dlt } = config.topicos;
  const admin = kafka.admin();
  const productor = kafka.producer({ allowAutoTopicCreation: false });
  const consumidor = kafka.consumer({ groupId: config.grupo });
  let conectado = false;

  // Aiven no crea tópicos solo: se aseguran los tres del ecosistema.
  await admin.connect();
  try {
    await admin.createTopics({ topics: [comandos, eventos, dlt].map(topic => ({ topic, numPartitions: 3 })) });
  } finally {
    await admin.disconnect();
  }
  await productor.connect();

  const deps = {
    consultar: limitarConsultas(consultar, config.pausaEntreConsultasMs),
    publicarEvento: (clave, sobre) =>
      productor.send({ topic: eventos, messages: [{ key: clave, value: JSON.stringify(sobre) }] }),
    // Se copia el mensaje tal como llegó (con su sobre), sin volver a codificarlo.
    publicarDlt: (clave, valor) => productor.send({ topic: dlt, messages: [{ key: clave, value: valor }] }),
    dormir: ms => new Promise(resolver => setTimeout(resolver, ms)),
    log,
  };

  await consumidor.connect();
  await consumidor.subscribe({ topic: comandos, fromBeginning: false });
  await consumidor.run({
    // Una consulta a la vez: es el límite de concurrencia que pide el contrato.
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ message }) => {
      const clave = message.key ? message.key.toString('utf8') : null;
      await atenderComando({ clave, valor: message.value }, deps, config);
    },
  });
  conectado = true;
  log('info', `Servicio de multas escuchando ${comandos} (grupo ${config.grupo}).`);

  return {
    conectado: () => conectado,
    detener: async () => {
      conectado = false;
      await consumidor.disconnect();
      await productor.disconnect();
    },
  };
}

module.exports = { iniciarServicio, opcionesDeConexion };
