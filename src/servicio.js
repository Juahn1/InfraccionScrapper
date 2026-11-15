#!/usr/bin/env node
'use strict';

// Punto de entrada del servicio `multas`: atiende ConsultarMultas por Kafka y expone /health.

const http = require('node:http');
const { leerConfig } = require('./kafka/config');
const { iniciarServicio } = require('./kafka/servicio');
const { consultarInfraccionesPorDominio } = require('./index');

const log = (nivel, texto) => process.stderr.write(`[multas] ${nivel.toUpperCase()} ${texto}\n`);

function servidorDeSalud(puerto, estaConectado) {
  const servidor = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    const arriba = estaConectado();
    res.writeHead(arriba ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: arriba ? 'UP' : 'DOWN', componentes: { kafka: { status: arriba ? 'UP' : 'DOWN' } } }));
  });
  servidor.listen(puerto);
  return servidor;
}

async function main() {
  const config = leerConfig();
  let servicio = null;
  const salud = servidorDeSalud(config.puerto, () => servicio !== null && servicio.conectado());
  servicio = await iniciarServicio(config, consultarInfraccionesPorDominio, { log });

  const apagar = async () => {
    salud.close();
    await servicio.detener();
    process.exit(0);
  };
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}

main().catch(err => {
  log('error', `No se pudo iniciar el servicio: ${err.message}`);
  process.exit(1);
});
