'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { leerConfiguracion, arrancar, HOST_POR_DEFECTO, PUERTO_POR_DEFECTO } = require('../src/server');
const { ErrorConfiguracion } = require('../src/errors');

const RAIZ = path.join(__dirname, '..');

// Puerto libre elegido por el sistema operativo.
function puertoLibre() {
  return new Promise((resolver, rechazar) => {
    const s = net.createServer();
    s.once('error', rechazar);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolver(port));
    });
  });
}

// ---------- 3.1 Configuración ----------

test('3.1 sin variables: puerto 3000, host 127.0.0.1 y timeout de 10 s', () => {
  const c = leerConfiguracion({});
  assert.equal(c.puerto, 3000);
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.timeoutMs, 10000);
  assert.equal(PUERTO_POR_DEFECTO, 3000);
  assert.equal(HOST_POR_DEFECTO, '127.0.0.1');
});

test('3.1 las variables de entorno reemplazan los defaults', () => {
  const c = leerConfiguracion({
    INFRACCIONES_HTTP_PORT: '4100',
    INFRACCIONES_HTTP_HOST: '0.0.0.0',
    INFRACCIONES_TIMEOUT_SEGUNDOS: '25',
  });
  assert.equal(c.puerto, 4100);
  assert.equal(c.host, '0.0.0.0');
  assert.equal(c.timeoutMs, 25000);
});

test('3.1 timeout no numérico, cero o negativo se rechaza con ErrorConfiguracion', () => {
  for (const valor of ['abc', '0', '-5']) {
    assert.throws(
      () => leerConfiguracion({ INFRACCIONES_TIMEOUT_SEGUNDOS: valor }),
      err => err instanceof ErrorConfiguracion && /INFRACCIONES_TIMEOUT_SEGUNDOS/.test(err.message),
      valor
    );
  }
});

test('3.1 puerto no numérico o fuera de rango se rechaza con ErrorConfiguracion', () => {
  for (const valor of ['abc', '70000', '-1', '3.5']) {
    assert.throws(
      () => leerConfiguracion({ INFRACCIONES_HTTP_PORT: valor }),
      err => err instanceof ErrorConfiguracion,
      valor
    );
  }
});

test('3.1 sin variables de red el servidor escucha solo en 127.0.0.1', async () => {
  // Se usa puerto 0 para no depender de 3000; el host viene del default.
  const servidor = await arrancar({ INFRACCIONES_HTTP_PORT: '0' });
  try {
    assert.equal(servidor.address().address, '127.0.0.1');
  } finally {
    await new Promise(r => servidor.close(r));
  }
});

test('3.1 arrancar en un puerto ocupado rechaza la promesa', async () => {
  const ocupado = net.createServer();
  await new Promise(r => ocupado.listen(0, '127.0.0.1', r));
  const { port } = ocupado.address();
  try {
    await assert.rejects(arrancar({ INFRACCIONES_HTTP_PORT: String(port) }));
  } finally {
    await new Promise(r => ocupado.close(r));
  }
});

// ---------- 3.2 Arranque y script npm ----------

test('3.2 package.json define el script servidor', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.servidor, 'node src/server.js');
});

// Se lanza node directamente (sin shell): así hijo.kill() termina el servidor y no deja procesos colgados.
// El script `npm run servidor` se verifica aparte con la prueba del package.json y una corrida manual.
test('3.2 el servidor arranca desde src/server.js y responde 400 a GET sin parámetro', async () => {
  const puerto = await puertoLibre();
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'src', 'server.js')], {
    env: { ...process.env, INFRACCIONES_HTTP_PORT: String(puerto) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let estado = null;
    const limite = Date.now() + 15000;
    while (Date.now() < limite && estado === null) {
      try {
        const res = await fetch(`http://127.0.0.1:${puerto}/getMultasPorDominio`);
        await res.text();
        estado = res.status;
      } catch {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    assert.equal(estado, 400);
  } finally {
    hijo.kill();
  }
});

test('3.2 con timeout inválido el arranque falla con código 2 y menciona la variable', async () => {
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'src', 'server.js')], {
    env: { ...process.env, INFRACCIONES_TIMEOUT_SEGUNDOS: 'abc' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  hijo.stderr.on('data', d => { stderr += d; });
  const codigo = await new Promise(r => hijo.on('close', r));
  assert.equal(codigo, 2);
  assert.match(stderr, /INFRACCIONES_TIMEOUT_SEGUNDOS/);
});
