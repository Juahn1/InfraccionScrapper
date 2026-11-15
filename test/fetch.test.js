'use strict';

// Pruebas de la cancelación por señal en buscarPorDominio.
// Usan un navegador falso: `goto` queda colgado hasta que el navegador se cierra,
// así que no requieren Chromium ni red.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buscarPorDominio } = require('../src/fetch');
const { consultarInfraccionesPorDominio } = require('../src/index');
const { ErrorTiempoAgotado, ErrorSitioNoDisponible } = require('../src/errors');

function navegadorColgado() {
  const registro = { cerrado: false, lanzado: false };
  let rechazarPendiente;
  const pagina = {
    on() {},
    goto: () => new Promise((_, rechazar) => { rechazarPendiente = rechazar; }),
  };
  const navegador = {
    newPage: async () => pagina,
    close: async () => {
      registro.cerrado = true;
      if (rechazarPendiente) rechazarPendiente(new Error('Target page, context or browser has been closed'));
    },
  };
  registro.lanzar = async () => { registro.lanzado = true; return navegador; };
  return registro;
}

test('señal disparada en mitad de la consulta cierra el navegador y lanza ErrorTiempoAgotado', async () => {
  const falso = navegadorColgado();
  const controlador = new AbortController();
  setTimeout(() => controlador.abort(), 50);

  await assert.rejects(
    buscarPorDominio('AAA111', { lanzarNavegador: falso.lanzar, signal: controlador.signal }),
    err => err instanceof ErrorTiempoAgotado
  );
  assert.equal(falso.lanzado, true);
  assert.equal(falso.cerrado, true);
});

test('señal ya disparada: no abre el navegador y lanza ErrorTiempoAgotado', async () => {
  const falso = navegadorColgado();
  const controlador = new AbortController();
  controlador.abort();

  await assert.rejects(
    buscarPorDominio('AAA111', { lanzarNavegador: falso.lanzar, signal: controlador.signal }),
    err => err instanceof ErrorTiempoAgotado
  );
  assert.equal(falso.lanzado, false);
});

test('sin señal el comportamiento no cambia: una falla del sitio sigue siendo ErrorSitioNoDisponible', async () => {
  const navegador = {
    newPage: async () => ({ on() {}, goto: async () => { throw new Error('net::ERR_CONNECTION_RESET'); } }),
    close: async () => {},
  };
  await assert.rejects(
    buscarPorDominio('AAA111', { lanzarNavegador: async () => navegador }),
    err => err instanceof ErrorSitioNoDisponible
  );
});

test('consultarInfraccionesPorDominio pasa la señal a buscarPorDominio', async () => {
  const falso = navegadorColgado();
  const controlador = new AbortController();
  setTimeout(() => controlador.abort(), 50);

  await assert.rejects(
    consultarInfraccionesPorDominio('AAA111', { lanzarNavegador: falso.lanzar, signal: controlador.signal }),
    err => err instanceof ErrorTiempoAgotado
  );
  assert.equal(falso.cerrado, true);
});
