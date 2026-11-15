'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearServidor } = require('../src/server');
const {
  ErrorSitioNoDisponible,
  ErrorEstructuraNoReconocida,
  ErrorTiempoAgotado,
} = require('../src/errors');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const RESULTADO = {
  dominio: 'AAA111',
  infracciones: [
    { numeroActa: '000000000000001', dominio: 'AAA111', importe: 33150, importeSinDescuento: 39000 },
    { numeroActa: '000000000000002', dominio: 'AAA111', importe: 12500.5, importeSinDescuento: null },
  ],
  subtotal: 51500.5,
};

// Arranca el servidor en un puerto libre y devuelve su base URL y una función para cerrarlo.
async function arrancar(opciones) {
  const servidor = crearServidor(opciones);
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  return {
    base: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise(r => servidor.close(r)),
  };
}

async function pedir(base, ruta, { metodo = 'GET' } = {}) {
  const res = await fetch(`${base}${ruta}`, { method: metodo });
  const texto = await res.text();
  return { status: res.status, cabeceras: res.headers, texto, json: () => JSON.parse(texto) };
}

// ---------- 2.1 Respuesta exitosa ----------

test('2.1 GET /getMultasPorDominio con dominio devuelve 200 y el JSON de la consulta', async () => {
  const srv = await arrancar({ consultar: async () => RESULTADO });
  try {
    const r = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    assert.equal(r.status, 200);
    assert.match(r.cabeceras.get('content-type'), /application\/json/);
    assert.deepEqual(r.json(), RESULTADO);
  } finally {
    await srv.cerrar();
  }
});

// ---------- 2.2 Validación y rutas ----------

test('2.2 dominio ausente, vacío o de más de 7 caracteres responde 400 sin consultar', async () => {
  let llamadas = 0;
  const srv = await arrancar({ consultar: async () => { llamadas++; return RESULTADO; } });
  try {
    for (const ruta of [
      '/getMultasPorDominio',
      '/getMultasPorDominio?dominio=',
      '/getMultasPorDominio?dominio=%20%20',
      '/getMultasPorDominio?dominio=ABCDEFGH',
    ]) {
      const r = await pedir(srv.base, ruta);
      assert.equal(r.status, 400, ruta);
    }
    assert.equal(llamadas, 0);
  } finally {
    await srv.cerrar();
  }
});

test('2.2 otra ruta responde 404 y otro método responde 405, sin consultar', async () => {
  let llamadas = 0;
  const srv = await arrancar({ consultar: async () => { llamadas++; return RESULTADO; } });
  try {
    const otraRuta = await pedir(srv.base, '/otra?dominio=AAA111');
    assert.equal(otraRuta.status, 404);

    const metodo = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111', { metodo: 'POST' });
    assert.equal(metodo.status, 405);
    assert.equal(metodo.cabeceras.get('allow'), 'GET');

    assert.equal(llamadas, 0);
  } finally {
    await srv.cerrar();
  }
});

// ---------- 2.3 Mapeo de errores ----------

test('2.3 cada error tipado responde su código HTTP y el cuerpo no contiene subtotal', async () => {
  const casos = [
    [new ErrorSitioNoDisponible('caída'), 502],
    [new ErrorEstructuraNoReconocida(), 422],
    [new Error('algo inesperado'), 500],
  ];
  for (const [error, codigo] of casos) {
    const srv = await arrancar({ consultar: async () => { throw error; } });
    try {
      const r = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
      assert.equal(r.status, codigo, error.name);
      assert.doesNotMatch(r.texto, /subtotal/, error.name);
      assert.ok(r.json().error, error.name);
    } finally {
      await srv.cerrar();
    }
  }
});

test('2.3 el error 500 no expone el mensaje interno del error', async () => {
  const srv = await arrancar({ consultar: async () => { throw new Error('detalle interno AAA111'); } });
  try {
    const r = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.texto, /detalle interno|AAA111/);
  } finally {
    await srv.cerrar();
  }
});

// ---------- 2.4 Timeout total ----------

test('2.4 consulta más lenta que el timeout responde 504, cancela la consulta y cierra el navegador simulado', async () => {
  const estado = { cancelada: false };
  const consultaLenta = (_dominio, { signal }) => new Promise((_, rechazar) => {
    // Simula el navegador: al cancelar, la operación en curso falla.
    signal.addEventListener('abort', () => {
      estado.cancelada = true;
      rechazar(new ErrorTiempoAgotado());
    });
  });
  const srv = await arrancar({ consultar: consultaLenta, timeoutMs: 100 });
  try {
    const inicio = Date.now();
    const r = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    const duracion = Date.now() - inicio;
    assert.equal(r.status, 504);
    assert.ok(duracion < 1000, `respondió en ${duracion} ms`);
    assert.match(r.json().error, /tiempo total/);
    await sleep(20);
    assert.equal(estado.cancelada, true);
  } finally {
    await srv.cerrar();
  }
});

test('2.4 consulta dentro del timeout responde normalmente', async () => {
  const srv = await arrancar({ consultar: async () => RESULTADO, timeoutMs: 500 });
  try {
    const r = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    assert.equal(r.status, 200);
  } finally {
    await srv.cerrar();
  }
});

// ---------- 2.5 Cola secuencial ----------

test('2.5 dos peticiones simultáneas: ambas responden y la segunda no arranca hasta que termina la primera', async () => {
  const eventos = [];
  const consultaConPausa = async dominio => {
    eventos.push(`inicio ${dominio}`);
    await sleep(150);
    eventos.push(`fin ${dominio}`);
    return { ...RESULTADO, dominio };
  };
  const srv = await arrancar({ consultar: consultaConPausa, timeoutMs: 5000 });
  try {
    const [a, b] = await Promise.all([
      pedir(srv.base, '/getMultasPorDominio?dominio=AAA111'),
      pedir(srv.base, '/getMultasPorDominio?dominio=BBB222'),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    // Orden estrictamente secuencial: inicio, fin, inicio, fin.
    assert.equal(eventos[1].startsWith('fin'), true);
    assert.equal(eventos[2].startsWith('inicio'), true);
    assert.equal(eventos[0].split(' ')[1], eventos[1].split(' ')[1]);
    assert.equal(eventos[2].split(' ')[1], eventos[3].split(' ')[1]);
  } finally {
    await srv.cerrar();
  }
});

test('2.5 un error en una consulta no bloquea a la siguiente', async () => {
  let n = 0;
  const consultaFallaPrimera = async () => {
    n++;
    if (n === 1) throw new ErrorSitioNoDisponible('caída');
    return RESULTADO;
  };
  const srv = await arrancar({ consultar: consultaFallaPrimera, timeoutMs: 5000 });
  try {
    const a = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    const b = await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    assert.equal(a.status, 502);
    assert.equal(b.status, 200);
  } finally {
    await srv.cerrar();
  }
});

// ---------- 2.6 Logs sin datos personales ----------

test('2.6 el log de una consulta exitosa no contiene la patente, números de acta ni importes', async () => {
  const lineas = [];
  const srv = await arrancar({ consultar: async () => RESULTADO, log: l => lineas.push(l) });
  try {
    await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    const log = lineas.join('\n');
    assert.match(log, /estado=ok actas=2/);
    assert.doesNotMatch(log, /AAA111/);
    assert.doesNotMatch(log, /000000000000001|000000000000002/);
    assert.doesNotMatch(log, /33150|39000|12500|51500/);
  } finally {
    await srv.cerrar();
  }
});

test('2.6 el log de una consulta fallida no contiene la patente', async () => {
  const lineas = [];
  const srv = await arrancar({
    consultar: async () => { throw new ErrorSitioNoDisponible('caída en AAA111'); },
    log: l => lineas.push(l),
  });
  try {
    await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    const log = lineas.join('\n');
    assert.match(log, /estado=error tipo=ErrorSitioNoDisponible/);
    assert.doesNotMatch(log, /AAA111/);
  } finally {
    await srv.cerrar();
  }
});

test('2.6 el log de un timeout no contiene la patente', async () => {
  const lineas = [];
  const srv = await arrancar({
    consultar: (_d, { signal }) => new Promise((_, rechazar) => {
      signal.addEventListener('abort', () => rechazar(new ErrorTiempoAgotado()));
    }),
    timeoutMs: 80,
    log: l => lineas.push(l),
  });
  try {
    await pedir(srv.base, '/getMultasPorDominio?dominio=AAA111');
    await sleep(20);
    const log = lineas.join('\n');
    assert.match(log, /ErrorTiempoAgotado/);
    assert.doesNotMatch(log, /AAA111/);
  } finally {
    await srv.cerrar();
  }
});
