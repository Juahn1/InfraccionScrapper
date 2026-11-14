'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarPatente } = require('../src/validar');
const { buscarPorDominio } = require('../src/fetch');
const { ErrorValidacionPatente, ErrorSitioNoDisponible } = require('../src/errors');

test('validarPatente normaliza espacios y mayúsculas', () => {
  assert.equal(validarPatente('  aaa111 '), 'AAA111');
});

test('validarPatente rechaza vacía o solo espacios', () => {
  assert.throws(() => validarPatente(''), ErrorValidacionPatente);
  assert.throws(() => validarPatente('   '), ErrorValidacionPatente);
});

test('validarPatente rechaza más de 7 caracteres', () => {
  assert.throws(() => validarPatente('ABCDEFGH'), ErrorValidacionPatente);
});

test('patente inválida no abre el navegador', async () => {
  let navegadorLanzado = false;
  const lanzar = () => { navegadorLanzado = true; throw new Error('no debería lanzarse'); };
  await assert.rejects(() => buscarPorDominio('', { lanzarNavegador: lanzar }), ErrorValidacionPatente);
  await assert.rejects(() => buscarPorDominio('ABCDEFGH', { lanzarNavegador: lanzar }), ErrorValidacionPatente);
  assert.equal(navegadorLanzado, false);
});

test('respuesta 5xx al cargar el sitio se informa como sitio no disponible', async () => {
  let cerrado = false;
  const pagina = {
    on() {},
    async goto() { return { status: () => 503 }; },
  };
  const navegador = { async newPage() { return pagina; }, async close() { cerrado = true; } };
  await assert.rejects(
    () => buscarPorDominio('AAA111', { lanzarNavegador: async () => navegador }),
    ErrorSitioNoDisponible
  );
  assert.equal(cerrado, true, 'el navegador debe cerrarse aunque falle');
});

test('falla al iniciar el navegador se informa como sitio no disponible', async () => {
  const lanzar = async () => { throw new Error('no hay navegador'); };
  await assert.rejects(() => buscarPorDominio('AAA111', { lanzarNavegador: lanzar }), ErrorSitioNoDisponible);
});
