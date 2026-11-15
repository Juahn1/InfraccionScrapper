'use strict';

// El servidor HTTP es un servicio paralelo al de Kafka: ninguno importa al otro,
// y el servidor HTTP no usa la variable PORT que usa el servicio Kafka.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { leerConfiguracion } = require('../src/server');

const SRC = path.join(__dirname, '..', 'src');

function requiresDe(archivo) {
  const texto = fs.readFileSync(archivo, 'utf8');
  return [...texto.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
}

function archivosKafka() {
  const dir = path.join(SRC, 'kafka');
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
  return [...archivos, path.join(SRC, 'servicio.js')];
}

test('el servidor HTTP no importa ningún módulo de Kafka ni el punto de entrada del servicio', () => {
  const imports = requiresDe(path.join(SRC, 'server.js'));
  for (const imp of imports) {
    assert.doesNotMatch(imp, /kafka|servicio/i, `server.js importa ${imp}`);
  }
});

test('el servicio Kafka no importa el servidor HTTP', () => {
  for (const archivo of archivosKafka()) {
    for (const imp of requiresDe(archivo)) {
      assert.doesNotMatch(imp, /(^|\/)server(\.js)?$/, `${path.basename(archivo)} importa ${imp}`);
    }
  }
});

test('el servidor HTTP ignora PORT (la usa el servicio Kafka) y usa su propia variable', () => {
  const c = leerConfiguracion({ PORT: '8087' });
  assert.equal(c.puerto, 3000);
  const d = leerConfiguracion({ PORT: '8087', INFRACCIONES_HTTP_PORT: '4200' });
  assert.equal(d.puerto, 4200);
});
