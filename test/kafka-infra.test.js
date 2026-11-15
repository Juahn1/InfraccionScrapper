'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { armarSobre, leerSobre } = require('../src/kafka/sobre');
const { limitarConsultas } = require('../src/kafka/limitador');
const { leerConfig } = require('../src/kafka/config');
const { opcionesDeConexion } = require('../src/kafka/servicio');

// ---- sobre

test('el sobre lleva los campos comunes, fechas ISO como texto y el correlationId recibido', () => {
  const sobre = armarSobre('MultasConsultadas', { vehiculoId: 'v' }, 'cid-9', new Date('2026-11-15T12:00:00Z'));
  assert.equal(sobre.eventType, 'MultasConsultadas');
  assert.equal(sobre.version, 1);
  assert.equal(sobre.occurredAt, '2026-11-15T12:00:00.000Z');
  assert.equal(sobre.timestamp, sobre.occurredAt);
  assert.equal(sobre.correlationId, 'cid-9');
  assert.match(sobre.eventId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(sobre.payload, { vehiculoId: 'v' });
});

test('sin correlationId el sobre genera uno, y cada evento tiene su propio eventId', () => {
  const a = armarSobre('X', {});
  const b = armarSobre('X', {});
  assert.ok(a.correlationId);
  assert.notEqual(a.eventId, b.eventId);
});

test('leerSobre devuelve null si no es JSON, no es un objeto o no tiene eventType', () => {
  assert.equal(leerSobre(Buffer.from('no es json')), null);
  assert.equal(leerSobre('[1,2]'), null);
  assert.equal(leerSobre('"texto"'), null);
  assert.equal(leerSobre('{"payload":{}}'), null);
  assert.deepEqual(leerSobre(Buffer.from('{"eventType":"A","payload":{}}')), { eventType: 'A', payload: {} });
});

// ---- limitador

test('las consultas corren de a una, en orden, y con la pausa mínima entre una y otra', async () => {
  let ahora = 1000;
  const esperas = [];
  let enCurso = 0;
  let maximo = 0;
  const orden = [];
  const consultar = limitarConsultas(
    async entrada => {
      enCurso += 1;
      maximo = Math.max(maximo, enCurso);
      await new Promise(r => setImmediate(r));
      orden.push(entrada);
      enCurso -= 1;
      return entrada;
    },
    5000,
    { ahora: () => ahora, dormir: async ms => { esperas.push(ms); ahora += ms; } },
  );

  const resultados = await Promise.all([consultar('a'), consultar('b'), consultar('c')]);

  assert.deepEqual(resultados, ['a', 'b', 'c']);
  assert.deepEqual(orden, ['a', 'b', 'c']);
  assert.equal(maximo, 1);
  assert.deepEqual(esperas, [5000, 5000]); // la primera no espera
});

test('una consulta que falla no traba a las que siguen y también cuenta para la pausa', async () => {
  let ahora = 0;
  const esperas = [];
  const consultar = limitarConsultas(
    async entrada => { if (entrada === 'mala') throw new Error('falló'); return entrada; },
    100,
    { ahora: () => ahora, dormir: async ms => { esperas.push(ms); ahora += ms; } },
  );

  await assert.rejects(consultar('mala'), /falló/);
  assert.equal(await consultar('buena'), 'buena');
  assert.deepEqual(esperas, [100]);
});

// ---- configuración

test('la configuración tiene valores por defecto del ecosistema', () => {
  const c = leerConfig({});
  assert.equal(c.servicio, 'multas');
  assert.deepEqual(c.brokers, ['localhost:9092']);
  assert.deepEqual(c.topicos, { comandos: 'crm.comandos', eventos: 'crm.eventos', dlt: 'crm.dlt' });
  assert.equal(c.reintentos, 3);
  assert.equal(c.esperaReintentoMs, 2000);
  assert.equal(c.pausaEntreConsultasMs, 5000);
});

test('la configuración lee las variables y rechaza valores inválidos', () => {
  const c = leerConfig({ KAFKA_TOPICO_COMANDOS: 'otro', KAFKA_BOOTSTRAP_SERVERS: 'a:1, b:2', MULTAS_PAUSA_ENTRE_CONSULTAS_SEGUNDOS: '0' });
  assert.equal(c.topicos.comandos, 'otro');
  assert.deepEqual(c.brokers, ['a:1', 'b:2']);
  assert.equal(c.pausaEntreConsultasMs, 0);
  assert.throws(() => leerConfig({ KAFKA_REINTENTOS_COMANDO: 'tres' }), /KAFKA_REINTENTOS_COMANDO/);
  assert.throws(() => leerConfig({ KAFKA_SASL_MECHANISM: 'GSSAPI' }), /no soportado/);
});

test('sin seguridad la conexión es abierta; con SASL_SSL lleva ssl y credenciales', () => {
  assert.equal(opcionesDeConexion(leerConfig({})).ssl, undefined);
  assert.equal(opcionesDeConexion(leerConfig({})).sasl, undefined);

  const segura = opcionesDeConexion(leerConfig({
    KAFKA_SECURITY_PROTOCOL: 'SASL_SSL', KAFKA_SASL_MECHANISM: 'SCRAM-SHA-256', KAFKA_SASL_USERNAME: 'u', KAFKA_SASL_PASSWORD: 'p',
  }));
  assert.equal(segura.ssl, true);
  assert.deepEqual(segura.sasl, { mechanism: 'scram-sha-256', username: 'u', password: 'p' });
});

test('con SASL sin credenciales el servicio no arranca', () => {
  assert.throws(() => opcionesDeConexion(leerConfig({ KAFKA_SECURITY_PROTOCOL: 'SASL_SSL' })), /KAFKA_SASL_MECHANISM/);
});
