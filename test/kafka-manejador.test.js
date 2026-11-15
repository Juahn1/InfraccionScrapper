'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { atenderComando } = require('../src/kafka/manejador');
const { ErrorSitioNoDisponible, ErrorEstructuraNoReconocida, ErrorValidacionPatente } = require('../src/errors');

const CONFIG = { servicio: 'multas', reintentos: 3, esperaReintentoMs: 1000 };
const VEHICULO = '5a1c1b0e-0000-4000-8000-000000000001';
const ACTA = { numeroActa: 'A-1', dominio: 'AB123CD', importe: 33150, importeSinDescuento: 39000, tipoInfraccion: 'LEY', lugar: 'X', juzgado: 'J' };

function comando(sobreras = {}) {
  return {
    eventId: 'e-1', eventType: 'ConsultarMultas', version: 1, occurredAt: '2026-11-15T12:00:00Z',
    timestamp: '2026-11-15T12:00:00Z', correlationId: 'cid-1', destino: 'multas',
    payload: { vehiculoId: VEHICULO, patente: 'AB123CD' }, ...sobreras,
  };
}

const valorDe = mensaje => Buffer.from(JSON.stringify(mensaje));

function entorno({ consultar, publicarEvento } = {}) {
  const e = { eventos: [], dlt: [], esperas: [], logs: [], consultas: [] };
  e.deps = {
    consultar: consultar || (async patente => { e.consultas.push(patente); return { dominio: patente, infracciones: [ACTA], subtotal: 39000 }; }),
    publicarEvento: publicarEvento || (async (clave, sobre) => { e.eventos.push({ clave, sobre }); }),
    publicarDlt: async (clave, valor) => { e.dlt.push({ clave, valor }); },
    dormir: async ms => { e.esperas.push(ms); },
    log: (nivel, texto) => e.logs.push({ nivel, texto }),
  };
  return e;
}

const atender = (e, mensaje, valor) => atenderComando({ clave: VEHICULO, valor: valor || valorDe(mensaje) }, e.deps, CONFIG);

test('responde MultasConsultadas con el resultado, el mismo correlationId y la clave del vehículo', async () => {
  const e = entorno();
  assert.equal(await atender(e, comando()), 'consultada');

  assert.deepEqual(e.consultas, ['AB123CD']);
  const { clave, sobre } = e.eventos[0];
  assert.equal(clave, VEHICULO);
  assert.equal(sobre.eventType, 'MultasConsultadas');
  assert.equal(sobre.correlationId, 'cid-1');
  assert.equal(sobre.version, 1);
  assert.equal('destino' in sobre, false); // los eventos no llevan destino
  assert.deepEqual(sobre.payload, { vehiculoId: VEHICULO, dominio: 'AB123CD', infracciones: [ACTA], subtotal: 39000 });
  assert.equal(e.dlt.length, 0);
});

test('una patente sin multas es un resultado válido y conserva el mensaje del sitio', async () => {
  const e = entorno({ consultar: async patente => ({ dominio: patente, infracciones: [], subtotal: 0, mensaje: 'Este auto no tiene multas registradas' }) });
  assert.equal(await atender(e, comando()), 'consultada');
  assert.deepEqual(e.eventos[0].sobre.payload.infracciones, []);
  assert.equal(e.eventos[0].sobre.payload.mensaje, 'Este auto no tiene multas registradas');
});

test('ignora los comandos de otros servicios y los que no son ConsultarMultas', async () => {
  const e = entorno();
  assert.equal(await atender(e, comando({ destino: 'clientes' })), 'ignorado');
  assert.equal(await atender(e, comando({ eventType: 'GenerarResumen' })), 'ignorado');
  assert.equal(await atender(e, comando({ destino: undefined })), 'ignorado');
  assert.deepEqual([e.consultas, e.eventos, e.dlt], [[], [], []]);
});

test('el sitio caído se informa como reintentable y no se reintenta acá', async () => {
  const e = entorno({ consultar: async () => { throw new ErrorSitioNoDisponible('timeout'); } });
  assert.equal(await atender(e, comando()), 'fallida');
  assert.deepEqual(e.eventos[0].sobre.payload, { vehiculoId: VEHICULO, motivo: 'SITIO_NO_DISPONIBLE', reintentable: true });
  assert.equal(e.eventos[0].sobre.eventType, 'ConsultaMultasFallida');
  assert.deepEqual(e.esperas, []);
  assert.equal(e.dlt.length, 0);
});

test('un cambio de estructura del sitio se informa como no reintentable y se registra como error', async () => {
  const e = entorno({ consultar: async () => { throw new ErrorEstructuraNoReconocida(); } });
  await atender(e, comando());
  assert.deepEqual(e.eventos[0].sobre.payload, { vehiculoId: VEHICULO, motivo: 'ESTRUCTURA_NO_RECONOCIDA', reintentable: false });
  assert.ok(e.logs.some(l => l.nivel === 'error' && l.texto.includes('ESTRUCTURA_NO_RECONOCIDA')));
});

test('una patente inválida se informa como no reintentable', async () => {
  const e = entorno({ consultar: async () => { throw new ErrorValidacionPatente('vacía'); } });
  await atender(e, comando({ payload: { vehiculoId: VEHICULO, patente: '' } }));
  assert.deepEqual(e.eventos[0].sobre.payload, { vehiculoId: VEHICULO, motivo: 'PATENTE_INVALIDA', reintentable: false });
});

test('un comando sin patente se informa como patente inválida y sin llamar al sitio', async () => {
  const consultas = [];
  const e = entorno({ consultar: async patente => { consultas.push(patente); throw new ErrorValidacionPatente('vacía'); } });
  await atender(e, comando({ payload: { vehiculoId: VEHICULO } }));
  assert.equal(e.eventos[0].sobre.payload.motivo, 'PATENTE_INVALIDA');
});

test('un error inesperado se reintenta con espera creciente y, si se repite, el comando va a la DLT tal como llegó', async () => {
  let llamadas = 0;
  const e = entorno({ consultar: async () => { llamadas += 1; throw new TypeError('algo raro'); } });
  const valor = valorDe(comando());

  assert.equal(await atender(e, null, valor), 'dlt');

  assert.equal(llamadas, 3);
  assert.deepEqual(e.esperas, [1000, 2000]); // sin espera tras el último intento
  assert.equal(e.eventos.length, 0);
  assert.equal(e.dlt.length, 1);
  assert.equal(e.dlt[0].valor, valor); // el mismo mensaje, sin recodificar
  assert.equal(e.dlt[0].clave, VEHICULO);
});

test('un error inesperado que se resuelve al reintentar publica el resultado', async () => {
  let llamadas = 0;
  const e = entorno({
    consultar: async patente => {
      llamadas += 1;
      if (llamadas === 1) throw new TypeError('una vez');
      return { dominio: patente, infracciones: [], subtotal: 0 };
    },
  });
  assert.equal(await atender(e, comando()), 'consultada');
  assert.equal(llamadas, 2);
  assert.equal(e.eventos.length, 1);
});

test('si falla la publicación se reintenta publicar sin volver a consultar el sitio', async () => {
  let publicaciones = 0;
  const e = entorno({
    publicarEvento: async () => { publicaciones += 1; if (publicaciones < 3) throw new Error('kafka caído'); },
  });
  assert.equal(await atender(e, comando()), 'consultada');
  assert.equal(publicaciones, 3);
  assert.equal(e.consultas.length, 1);
});

test('si la publicación nunca funciona, el comando va a la DLT', async () => {
  const e = entorno({ publicarEvento: async () => { throw new Error('kafka caído'); } });
  assert.equal(await atender(e, comando()), 'dlt');
  assert.equal(e.dlt.length, 1);
});

test('un mensaje que no es JSON va a la DLT sin tocar el sitio', async () => {
  const e = entorno();
  const basura = Buffer.from('esto no es json');
  assert.equal(await atender(e, null, basura), 'dlt');
  assert.equal(e.dlt[0].valor, basura);
  assert.equal(e.consultas.length, 0);
});

test('un comando sin vehiculoId va a la DLT', async () => {
  const e = entorno();
  assert.equal(await atender(e, comando({ payload: { patente: 'AB123CD' } })), 'dlt');
  assert.equal(e.consultas.length, 0);
});

test('un Comando ConsultarMultas con leadId (patente del lead) responde usando leadId como clave', async () => {
  const e = entorno();
  const leadId = 'b6d4c1e2-0000-4000-8000-000000000009';
  const mensaje = {
    eventId: 'e-2', eventType: 'ConsultarMultas', version: 1, occurredAt: '2026-11-15T12:00:00Z',
    timestamp: '2026-11-15T12:00:00Z', correlationId: 'cid-2', destino: 'multas',
    payload: { leadId, patente: 'AB123CD' },
  };
  assert.equal(await atenderComando({ clave: leadId, valor: valorDe(mensaje) }, e.deps, CONFIG), 'consultada');

  assert.deepEqual(e.consultas, ['AB123CD']);
  const { clave, sobre } = e.eventos[0];
  assert.equal(clave, leadId);
  assert.equal(sobre.eventType, 'MultasConsultadas');
  assert.equal(sobre.correlationId, 'cid-2');
  assert.deepEqual(sobre.payload, { leadId, dominio: 'AB123CD', infracciones: [ACTA], subtotal: 39000 });
  assert.equal(e.dlt.length, 0);
});

test('una consulta fallida con leadId responde ConsulaMultasFallida con leadId', async () => {
  const e = entorno({ consultar: async () => { throw new ErrorSitioNoDisponible('timeout'); } });
  const leadId = 'b6d4c1e2-0000-4000-8000-000000000009';
  const mensaje = {
    eventId: 'e-3', eventType: 'ConsultarMultas', version: 1, occurredAt: '2026-11-15T12:00:00Z',
    timestamp: '2026-11-15T12:00:00Z', correlationId: 'cid-3', destino: 'multas',
    payload: { leadId, patente: 'AB123CD' },
  };
  assert.equal(await atenderComando({ clave: leadId, valor: valorDe(mensaje) }, e.deps, CONFIG), 'fallida');
  assert.deepEqual(e.eventos[0].sobre.payload, { leadId, motivo: 'SITIO_NO_DISPONIBLE', reintentable: true });
});

test('el log no lleva la patente, las actas ni los importes', async () => {
  const exitosa = entorno();
  await atender(exitosa, comando());
  const fallida = entorno({ consultar: async () => { throw new ErrorSitioNoDisponible('AB123CD no responde'); } });
  await atender(fallida, comando());
  const rota = entorno({ consultar: async () => { throw new TypeError('AB123CD'); } });
  await atender(rota, comando());

  const todo = [...exitosa.logs, ...fallida.logs, ...rota.logs].map(l => l.texto).join('\n');
  assert.ok(todo.length > 0);
  for (const secreto of ['AB123CD', 'A-1', '33150', '39000']) {
    assert.equal(todo.includes(secreto), false, `el log no debería incluir ${secreto}`);
  }
  assert.ok(exitosa.logs.some(l => l.texto.includes('actas=1')));
});
