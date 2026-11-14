'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { main } = require('../src/cli');
const { parseResultados } = require('../src/parse');
const { construirResultado } = require('../src/format');
const { ErrorSitioNoDisponible } = require('../src/errors');

const fixture = nombre => fs.readFileSync(path.join(__dirname, 'fixtures', nombre), 'utf8');

function capturar() {
  let out = '';
  let err = '';
  return {
    stdout: { write: s => { out += s; } },
    stderr: { write: s => { err += s; } },
    get out() { return out; },
    get err() { return err; },
  };
}

const resultadoFixture = () => construirResultado('XXX000', parseResultados(fixture('con-descuento.html')));

test('stdout contiene el JSON con dominio, infracciones y subtotal, y el código es 0', async () => {
  const io = capturar();
  const codigo = await main(['XXX000'], { consultar: async () => resultadoFixture(), ...io });
  assert.equal(codigo, 0);
  const json = JSON.parse(io.out);
  assert.equal(json.dominio, 'XXX000');
  assert.equal(json.infracciones.length, 2);
  assert.equal(json.subtotal, 51500.5);
});

test('el log de una consulta exitosa no contiene dominio, números de acta ni importes', async () => {
  const io = capturar();
  await main(['XXX000'], { consultar: async () => resultadoFixture(), ...io });
  assert.match(io.err, /estado=ok actas=2/);
  assert.doesNotMatch(io.err, /XXX000/);
  assert.doesNotMatch(io.err, /000000000000001|000000000000002/);
  assert.doesNotMatch(io.err, /33\.150|39\.000|12\.500|51\.500|39000|51500/);
});

test('error de consulta: código 1, sin JSON en stdout y log con el tipo de error', async () => {
  const io = capturar();
  const codigo = await main(['XXX000'], {
    consultar: async () => { throw new ErrorSitioNoDisponible('caída'); },
    ...io,
  });
  assert.equal(codigo, 1);
  assert.equal(io.out, '');
  assert.match(io.err, /estado=error tipo=ErrorSitioNoDisponible/);
  assert.doesNotMatch(io.err, /XXX000/);
});

test('sin patente: muestra el uso y devuelve código 2', async () => {
  const io = capturar();
  const codigo = await main([], { consultar: async () => { throw new Error('no debería llamarse'); }, ...io });
  assert.equal(codigo, 2);
  assert.match(io.err, /Uso: infracciones/);
});
