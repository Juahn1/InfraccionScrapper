'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseResultados, ESTADO } = require('../src/parse');

const fixture = nombre => fs.readFileSync(path.join(__dirname, 'fixtures', nombre), 'utf8');

test('acta con pago voluntario con descuento: toma importe sin descuento y el encabezado aparte', () => {
  const r = parseResultados(fixture('con-descuento.html'));
  assert.equal(r.estado, ESTADO.CON_ACTAS);
  const acta = r.actas[0];
  assert.equal(acta.numeroActa, '000000000000001');
  assert.equal(acta.dominio, 'XXX000');
  assert.equal(acta.importeEncabezado, '$ 33.150,00');
  assert.equal(acta.importeSinDescuento, '39.000,00');
  assert.equal(acta.tipoInfraccion, 'LEY 00.000 - Artículo: 1 - Texto de prueba con descuento.');
  assert.equal(acta.lugar, 'Lugar Sintetico (Ciudad - Provincia)');
  assert.equal(acta.juzgado, 'Juzgado Sintetico (Ciudad - Provincia)');
});

test('acta sin línea de descuento: importe sin descuento es null', () => {
  const r = parseResultados(fixture('con-descuento.html'));
  const acta = r.actas[1];
  assert.equal(acta.numeroActa, '000000000000002');
  assert.equal(acta.importeEncabezado, '$ 12.500,50');
  assert.equal(acta.importeSinDescuento, null);
  assert.equal(acta.tipoInfraccion, 'ORD. 0000 - CIUDAD SINTETICA - Artículo: 2 - Texto de prueba sin descuento.');
});

test('patente sin actas con contenedor presente: estado sin_actas y lista vacía', () => {
  const r = parseResultados(fixture('sin-actas.html'));
  assert.equal(r.estado, ESTADO.SIN_ACTAS);
  assert.deepEqual(r.actas, []);
});

test('página ajena sin contenedor ni formulario: estructura no reconocida, no resultado vacío', () => {
  const r = parseResultados(fixture('pagina-ajena.html'));
  assert.equal(r.estado, ESTADO.ESTRUCTURA_NO_RECONOCIDA);
  assert.deepEqual(r.actas, []);
});
