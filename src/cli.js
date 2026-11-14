#!/usr/bin/env node
'use strict';

const { consultarInfraccionesPorDominio } = require('./index');

const USO = 'Uso: infracciones <patente>\n  Ejemplo: infracciones AAA111\n';

/**
 * Punto de entrada de la CLI.
 * - Resultado JSON por stdout.
 * - Log de ejecución por stderr, SIN dominio, números de acta ni importes (solo estado y cantidad de actas).
 * - Devuelve el código de salida: 0 ok, 1 error de consulta, 2 uso incorrecto.
 */
async function main(argv, {
  consultar = consultarInfraccionesPorDominio,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const log = mensaje => stderr.write(`[infracciones] ${mensaje}\n`);

  const patente = argv[0];
  if (!patente) {
    stderr.write(USO);
    return 2;
  }

  try {
    const resultado = await consultar(patente);
    stdout.write(JSON.stringify(resultado, null, 2) + '\n');
    log(`consulta completada estado=ok actas=${resultado.infracciones.length}`);
    return 0;
  } catch (err) {
    // Solo el tipo de error: el mensaje puede arrastrar detalles del sitio.
    log(`consulta fallida estado=error tipo=${err.name}`);
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(codigo => { process.exitCode = codigo; });
}

module.exports = { main };
