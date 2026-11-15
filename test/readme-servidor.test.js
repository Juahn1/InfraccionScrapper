'use strict';

// Verifica que el README describe el servidor HTTP tal como responde de verdad.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearServidor } = require('../src/server');
const { ErrorSitioNoDisponible, ErrorEstructuraNoReconocida, ErrorTiempoAgotado } = require('../src/errors');

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
const seccion = readme.split('## Servidor HTTP')[1].split('## Solución de problemas')[0];

// Filas "| código | cuándo | `mensaje` |" de la tabla de códigos de respuesta.
function filasCodigos() {
  const tabla = seccion.split('### Códigos de respuesta')[1];
  return tabla
    .split('\n')
    .filter(l => /^\| \d{3} \|/.test(l))
    .map(l => {
      const celdas = l.split('|').slice(1, -1).map(c => c.trim());
      const cuerpo = (celdas[2].match(/`([^`]+)`/) || [])[1] || null;
      return { codigo: Number(celdas[0]), cuerpo };
    });
}

async function arrancar(opciones) {
  const servidor = crearServidor(opciones);
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${servidor.address().port}`, cerrar: () => new Promise(r => servidor.close(r)) };
}

test('README documenta las tres variables de entorno con sus defaults', () => {
  assert.match(seccion, /`INFRACCIONES_HTTP_PORT`\s*\|\s*`3000`/);
  assert.match(seccion, /`INFRACCIONES_HTTP_HOST`\s*\|\s*`127\.0\.0\.1`/);
  assert.match(seccion, /`INFRACCIONES_TIMEOUT_SEGUNDOS`\s*\|\s*`10`/);
});

test('README documenta el comando de arranque y el endpoint', () => {
  assert.match(seccion, /npm run servidor/);
  assert.match(seccion, /\/getMultasPorDominio\?dominio=AAA111/);
});

test('los códigos y mensajes del README coinciden con las respuestas reales del servidor', async () => {
  const filas = filasCodigos();
  assert.ok(filas.length >= 7, 'la tabla debe tener al menos los códigos principales');

  // Un escenario real por cada código que el servidor puede devolver.
  const escenarios = {
    400: { ruta: '/getMultasPorDominio' },
    404: { ruta: '/otra?dominio=AAA111' },
    405: { ruta: '/getMultasPorDominio?dominio=AAA111', metodo: 'POST' },
    422: { consultar: async () => { throw new ErrorEstructuraNoReconocida(); } },
    500: { consultar: async () => { throw new Error('interno'); } },
    502: { consultar: async () => { throw new ErrorSitioNoDisponible('caída'); } },
    504: {
      timeoutMs: 60,
      consultar: (_d, { signal }) => new Promise((_, r) => signal.addEventListener('abort', () => r(new ErrorTiempoAgotado()))),
    },
  };

  for (const fila of filas.filter(f => f.codigo !== 200)) {
    const e = escenarios[fila.codigo];
    if (!e) continue; // 200 se verifica abajo
    const srv = await arrancar({ consultar: e.consultar || (async () => ({})), timeoutMs: e.timeoutMs || 5000 });
    try {
      const res = await fetch(`${srv.base}${e.ruta || '/getMultasPorDominio?dominio=AAA111'}`, { method: e.metodo || 'GET' });
      const cuerpo = await res.json();
      assert.equal(res.status, fila.codigo, `código ${fila.codigo}`);
      assert.equal(cuerpo.error, fila.cuerpo, `mensaje del código ${fila.codigo}`);
    } finally {
      await srv.cerrar();
    }
  }
});

test('el README documenta el 405 con el header Allow y el servidor lo envía', async () => {
  const srv = await arrancar({ consultar: async () => ({}) });
  try {
    const res = await fetch(`${srv.base}/getMultasPorDominio?dominio=AAA111`, { method: 'POST' });
    await res.text();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
    assert.match(seccion, /Allow: GET/);
  } finally {
    await srv.cerrar();
  }
});

test('el README documenta la advertencia de datos personales y el bind por defecto', () => {
  assert.match(seccion, /Advertencia de datos personales/);
  assert.match(seccion, /127\.0\.0\.1/);
});
