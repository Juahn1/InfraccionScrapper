'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMontoArgentino, construirResultado, MENSAJE_SIN_MULTAS } = require('../src/format');
const { parseResultados } = require('../src/parse');
const { ErrorEstructuraNoReconocida } = require('../src/errors');

const fixture = nombre => fs.readFileSync(path.join(__dirname, 'fixtures', nombre), 'utf8');

test('montos argentinos: "$ 39.000,00" da 39000', () => {
  assert.equal(parseMontoArgentino('$ 39.000,00'), 39000);
});

test('montos argentinos: "$ 1.234.567,89" da 1234567.89', () => {
  assert.equal(parseMontoArgentino('$ 1.234.567,89'), 1234567.89);
});

test('montos argentinos: texto vacío o inválido da null', () => {
  assert.equal(parseMontoArgentino(null), null);
  assert.equal(parseMontoArgentino('sin monto'), null);
});

test('subtotal: suma importes sin descuento y usa el encabezado cuando no hay descuento', () => {
  // acta 1: sin descuento 39.000,00 (encabezado 33.150,00) ; acta 2: sin línea de descuento, encabezado 12.500,50
  const r = construirResultado('XXX000', parseResultados(fixture('con-descuento.html')));
  assert.equal(r.infracciones.length, 2);
  assert.equal(r.infracciones[0].importe, 33150);
  assert.equal(r.infracciones[0].importeSinDescuento, 39000);
  assert.equal(r.infracciones[1].importeSinDescuento, null);
  assert.equal(r.subtotal, 51500.5);
});

test('patente sin actas: lista vacía, subtotal 0 y mensaje, sin error', () => {
  const r = construirResultado('XXX000', parseResultados(fixture('sin-actas.html')));
  assert.deepEqual(r, { dominio: 'XXX000', infracciones: [], subtotal: 0, mensaje: MENSAJE_SIN_MULTAS });
  assert.equal(r.mensaje, 'Este auto no tiene multas registradas');
});

test('estructura no reconocida: lanza error y no devuelve subtotal', () => {
  assert.throws(
    () => construirResultado('XXX000', parseResultados(fixture('pagina-ajena.html'))),
    ErrorEstructuraNoReconocida
  );
});
