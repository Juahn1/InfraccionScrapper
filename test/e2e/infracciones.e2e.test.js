'use strict';

// 20 pruebas de extremo a extremo con Playwright.
// - 16 pruebas usan Chromium real con la red del sitio interceptada (no se consulta el sitio).
// - 4 pruebas en vivo consultan el sitio real; solo corren con RUN_LIVE=1.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { consultarInfraccionesPorDominio } = require('../../src/index');
const { main } = require('../../src/cli');
const { URL_SITIO } = require('../../src/fetch');
const { ErrorEstructuraNoReconocida, ErrorSitioNoDisponible, ErrorValidacionPatente } = require('../../src/errors');
const { MENSAJE_SIN_MULTAS } = require('../../src/format');

const fixture = nombre => fs.readFileSync(path.join(__dirname, '..', 'fixtures', nombre), 'utf8');
const FORMULARIO = fixture('formulario.html');
const CON_DESCUENTO = fixture('con-descuento.html');
const SIN_ACTAS = fixture('sin-actas.html');
const PAGINA_AJENA = fixture('pagina-ajena.html');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = { skip: process.env.RUN_LIVE !== '1' && 'Solo con RUN_LIVE=1 (consulta el sitio real)' };

// Navegador real con la red del sitio simulada según la patente enviada.
// Las patentes de prueba tienen 7 caracteres como máximo (límite de la spec).
function crearMock({ estadoGet = 200 } = {}) {
  const registro = { lanzado: false, peticiones: 0, cerrado: false };

  const responder = async (route, dominio) => {
    switch (dominio) {
      case 'MOCKDSC': return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CON_DESCUENTO });
      case 'MOCKVAC': return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: SIN_ACTAS });
      case 'MOCKAJE': return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA_AJENA });
      case 'MOCK500': return route.fulfill({ status: 500, contentType: 'text/plain', body: 'error' });
      case 'MOCKABT': return route.abort('connectionreset');
      case 'MOCKLNT': await sleep(3000); return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CON_DESCUENTO });
      default: return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CON_DESCUENTO });
    }
  };

  const lanzar = async () => {
    registro.lanzado = true;
    const navegador = await chromium.launch({ headless: true });

    const cerrarOriginal = navegador.close.bind(navegador);
    navegador.close = async (...args) => { registro.cerrado = true; return cerrarOriginal(...args); };

    const nuevaPaginaOriginal = navegador.newPage.bind(navegador);
    navegador.newPage = async (...args) => {
      const pagina = await nuevaPaginaOriginal(...args);
      await pagina.route(`${URL_SITIO}**`, async route => {
        registro.peticiones++;
        const req = route.request();
        if (req.method() === 'GET') {
          return route.fulfill({
            status: estadoGet,
            contentType: 'text/html; charset=utf-8',
            body: estadoGet === 200 ? FORMULARIO : 'error',
          });
        }
        const dominio = new URLSearchParams(req.postData() || '').get('dominio');
        return responder(route, dominio);
      });
      return pagina;
    };
    return navegador;
  };

  return { lanzar, registro };
}

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

// ---------- Pruebas con red simulada (16) ----------

test('01 flujo completo: el JSON tiene dominio, dos actas y subtotal 51500.5', async () => {
  const { lanzar } = crearMock();
  const r = await consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar });
  assert.equal(r.dominio, 'MOCKDSC');
  assert.equal(r.infracciones.length, 2);
  assert.equal(r.subtotal, 51500.5);
});

test('02 acta con descuento: importe del encabezado e importe sin descuento se separan', async () => {
  const { lanzar } = crearMock();
  const r = await consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar });
  assert.equal(r.infracciones[0].importe, 33150);
  assert.equal(r.infracciones[0].importeSinDescuento, 39000);
});

test('03 acta sin línea de descuento: importeSinDescuento es null y el importe sale del encabezado', async () => {
  const { lanzar } = crearMock();
  const r = await consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar });
  assert.equal(r.infracciones[1].importeSinDescuento, null);
  assert.equal(r.infracciones[1].importe, 12500.5);
});

test('04 tipo de infracción completo, lugar y juzgado llegan al resultado', async () => {
  const { lanzar } = crearMock();
  const r = await consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar });
  assert.equal(r.infracciones[0].tipoInfraccion, 'LEY 00.000 - Artículo: 1 - Texto de prueba con descuento.');
  assert.equal(r.infracciones[0].lugar, 'Lugar Sintetico (Ciudad - Provincia)');
  assert.equal(r.infracciones[0].juzgado, 'Juzgado Sintetico (Ciudad - Provincia)');
});

test('05 montos del JSON son números, no texto con formato argentino', async () => {
  const { lanzar } = crearMock();
  const r = await consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar });
  assert.equal(typeof r.subtotal, 'number');
  assert.ok(r.infracciones.every(a => typeof a.importe === 'number'));
});

test('06 patente sin actas: lista vacía, subtotal 0 y mensaje, sin error', async () => {
  const { lanzar } = crearMock();
  const r = await consultarInfraccionesPorDominio('MOCKVAC', { lanzarNavegador: lanzar });
  assert.deepEqual(r.infracciones, []);
  assert.equal(r.subtotal, 0);
  assert.equal(r.mensaje, MENSAJE_SIN_MULTAS);
});

test('07 página ajena: estructura no reconocida, sin esperar al timeout', async () => {
  const { lanzar } = crearMock();
  const inicio = Date.now();
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCKAJE', { lanzarNavegador: lanzar, timeoutMs: 10000 }),
    ErrorEstructuraNoReconocida
  );
  assert.ok(Date.now() - inicio < 10000, 'debe reportar el error sin agotar el timeout');
});

test('08 respuesta 500 a la búsqueda: sitio no disponible', async () => {
  const { lanzar } = crearMock();
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCK500', { lanzarNavegador: lanzar }),
    ErrorSitioNoDisponible
  );
});

test('09 respuesta 503 al cargar el sitio: sitio no disponible', async () => {
  const { lanzar } = crearMock({ estadoGet: 503 });
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar }),
    ErrorSitioNoDisponible
  );
});

test('10 búsqueda abortada por la red: sitio no disponible', async () => {
  const { lanzar } = crearMock();
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCKABT', { lanzarNavegador: lanzar, timeoutMs: 3000 }),
    ErrorSitioNoDisponible
  );
});

test('11 respuesta más lenta que el timeout: sitio no disponible', async () => {
  const { lanzar } = crearMock();
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCKLNT', { lanzarNavegador: lanzar, timeoutMs: 1000 }),
    ErrorSitioNoDisponible
  );
});

test('12 patente de 8 caracteres: rechazada sin abrir el navegador ni consultar el sitio', async () => {
  const { lanzar, registro } = crearMock();
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCKDSCX', { lanzarNavegador: lanzar }),
    ErrorValidacionPatente
  );
  assert.equal(registro.lanzado, false);
  assert.equal(registro.peticiones, 0);
});

test('13 el navegador se cierra después de una consulta exitosa', async () => {
  const { lanzar, registro } = crearMock();
  await consultarInfraccionesPorDominio('MOCKDSC', { lanzarNavegador: lanzar });
  assert.equal(registro.cerrado, true);
});

test('14 el navegador se cierra aunque la consulta falle', async () => {
  const { lanzar, registro } = crearMock();
  await assert.rejects(
    () => consultarInfraccionesPorDominio('MOCKABT', { lanzarNavegador: lanzar, timeoutMs: 3000 }),
    ErrorSitioNoDisponible
  );
  assert.equal(registro.cerrado, true);
});

test('15 CLI con flujo simulado: código 0 y JSON válido por stdout', async () => {
  const { lanzar } = crearMock();
  const io = capturar();
  const codigo = await main(['MOCKDSC'], {
    consultar: p => consultarInfraccionesPorDominio(p, { lanzarNavegador: lanzar }),
    ...io,
  });
  assert.equal(codigo, 0);
  const json = JSON.parse(io.out);
  assert.equal(json.subtotal, 51500.5);
  assert.doesNotMatch(io.err, /MOCKDSC|000000000000001|33\.150|39\.000/);
});

test('16 CLI con falla del sitio: código 1, stdout vacío y log sin la patente', async () => {
  const { lanzar } = crearMock();
  const io = capturar();
  const codigo = await main(['MOCK500'], {
    consultar: p => consultarInfraccionesPorDominio(p, { lanzarNavegador: lanzar }),
    ...io,
  });
  assert.equal(codigo, 1);
  assert.equal(io.out, '');
  assert.match(io.err, /tipo=ErrorSitioNoDisponible/);
  assert.doesNotMatch(io.err, /MOCK500/);
});

// ---------- Pruebas en vivo contra el sitio real (4) ----------
// Patentes usadas: una autorizada por el usuario para la verificación de integración,
// y dos patentes de formato válido que el sitio devolvió sin actas en la exploración.

test('17 [vivo] patente autorizada: hay actas y cada una trae número, importe, tipo, lugar y juzgado', LIVE, async () => {
  const r = await consultarInfraccionesPorDominio('AAA111');
  assert.ok(r.infracciones.length > 0, 'la patente autorizada debe tener actas');
  for (const a of r.infracciones) {
    assert.ok(a.numeroActa, 'numeroActa');
    assert.equal(typeof a.importe, 'number');
    assert.ok(a.tipoInfraccion && a.lugar && a.juzgado, 'tipo, lugar y juzgado');
  }
  assert.equal(typeof r.subtotal, 'number');
});

test('18 [vivo] consultas repetidas: mismo conjunto de actas y mismo subtotal', LIVE, async () => {
  const primera = await consultarInfraccionesPorDominio('AAA111');
  const segunda = await consultarInfraccionesPorDominio('AAA111');
  const numeros = r => r.infracciones.map(a => a.numeroActa).sort().join('|');
  assert.equal(numeros(segunda), numeros(primera));
  assert.equal(segunda.subtotal, primera.subtotal);
});

test('19 [vivo] patente sin actas (ZZZ000): mensaje y subtotal 0', LIVE, async () => {
  const r = await consultarInfraccionesPorDominio('ZZZ000');
  assert.deepEqual(r.infracciones, []);
  assert.equal(r.subtotal, 0);
  assert.equal(r.mensaje, MENSAJE_SIN_MULTAS);
});

test('20 [vivo] patente sin actas (XYZ123): mensaje y subtotal 0', LIVE, async () => {
  const r = await consultarInfraccionesPorDominio('XYZ123');
  assert.deepEqual(r.infracciones, []);
  assert.equal(r.mensaje, MENSAJE_SIN_MULTAS);
});
