'use strict';

const http = require('http');
const { consultarInfraccionesPorDominio } = require('./index');
const { validarPatente } = require('./validar');
const {
  ErrorValidacionPatente,
  ErrorSitioNoDisponible,
  ErrorEstructuraNoReconocida,
  ErrorTiempoAgotado,
  ErrorConfiguracion,
} = require('./errors');

const RUTA = '/getMultasPorDominio';
const TIMEOUT_POR_DEFECTO_MS = 10000;

// Código HTTP para cada error tipado. Cualquier otro error responde 500 genérico.
const CODIGO_POR_ERROR = [
  [ErrorValidacionPatente, 400],
  [ErrorTiempoAgotado, 504],
  [ErrorSitioNoDisponible, 502],
  [ErrorEstructuraNoReconocida, 422],
];

const MENSAJE_POR_CODIGO = {
  400: 'Parámetro dominio inválido.',
  404: 'Ruta no encontrada.',
  405: 'Método no permitido.',
  422: 'La página del sitio no tiene la estructura esperada; posible cambio del sitio.',
  500: 'Error interno al consultar.',
  502: 'Falla del sitio de consulta.',
  504: 'Se venció el tiempo total de la consulta.',
};

function enviar(res, codigo, cuerpo, cabeceras = {}) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras });
  res.end(JSON.stringify(cuerpo));
}

function codigoDeError(err) {
  const coincidencia = CODIGO_POR_ERROR.find(([Clase]) => err instanceof Clase);
  return coincidencia ? coincidencia[1] : 500;
}

/**
 * Crea el servidor HTTP del endpoint GET /getMultasPorDominio?dominio=<patente>.
 * - `consultar` es inyectable (por defecto, consultarInfraccionesPorDominio).
 * - `timeoutMs` es el tiempo total por request, contando la espera en cola.
 * - `log` recibe solo estado, cantidad de actas o tipo de error: nunca patente, actas ni importes.
 * - Las consultas se atienden de a una, en orden de llegada.
 */
function crearServidor({
  consultar = consultarInfraccionesPorDominio,
  timeoutMs = TIMEOUT_POR_DEFECTO_MS,
  log = () => {},
} = {}) {
  // Cola secuencial: cada consulta arranca cuando la anterior terminó.
  let cola = Promise.resolve();

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname !== RUTA) {
      return enviar(res, 404, { error: MENSAJE_POR_CODIGO[404] });
    }
    if (req.method !== 'GET') {
      return enviar(res, 405, { error: MENSAJE_POR_CODIGO[405] }, { Allow: 'GET' });
    }

    // La validación va antes de encolar: una patente inválida no espera turno ni toca el sitio.
    let dominio;
    try {
      dominio = validarPatente(url.searchParams.get('dominio'));
    } catch (err) {
      log(`consulta rechazada estado=error tipo=${err.name}`);
      return enviar(res, 400, { error: MENSAJE_POR_CODIGO[400] });
    }

    const controlador = new AbortController();
    let respondido = false;

    const responder = (codigo, cuerpo) => {
      if (respondido) return;
      respondido = true;
      clearTimeout(temporizador);
      enviar(res, codigo, cuerpo);
    };

    // El deadline total corre desde que llega la request, incluida la espera en cola.
    const temporizador = setTimeout(() => {
      controlador.abort();
      responder(504, { error: MENSAJE_POR_CODIGO[504] });
      log('consulta fallida estado=error tipo=ErrorTiempoAgotado');
    }, timeoutMs);

    const ejecutar = async () => {
      if (controlador.signal.aborted) throw new ErrorTiempoAgotado();
      return consultar(dominio, { signal: controlador.signal });
    };

    const consulta = cola.then(ejecutar);
    // La cola sigue aunque esta consulta falle, para no bloquear a las siguientes.
    cola = consulta.then(() => {}, () => {});

    consulta.then(
      resultado => {
        if (respondido) return;
        log(`consulta completada estado=ok actas=${resultado.infracciones.length}`);
        responder(200, resultado);
      },
      err => {
        if (respondido) return;
        const codigo = codigoDeError(err);
        log(`consulta fallida estado=error tipo=${err.name}`);
        responder(codigo, { error: MENSAJE_POR_CODIGO[codigo] || MENSAJE_POR_CODIGO[500] });
      }
    );
  });

  return servidor;
}

const HOST_POR_DEFECTO = '127.0.0.1';
const PUERTO_POR_DEFECTO = 3000;
const TIMEOUT_POR_DEFECTO_SEG = 10;

/**
 * Lee la configuración desde variables de entorno.
 * - INFRACCIONES_HTTP_PORT (default 3000)
 * - INFRACCIONES_HTTP_HOST (default 127.0.0.1)
 * - INFRACCIONES_TIMEOUT_SEGUNDOS (default 10): debe ser un número mayor que cero.
 * Un valor inválido lanza ErrorConfiguracion; no cae silenciosamente al default.
 */
function leerConfiguracion(env = process.env) {
  const textoPuerto = env.INFRACCIONES_HTTP_PORT ?? '';
  const puerto = textoPuerto === '' ? PUERTO_POR_DEFECTO : Number(textoPuerto);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
    throw new ErrorConfiguracion('INFRACCIONES_HTTP_PORT debe ser un entero entre 0 y 65535.');
  }

  const host = env.INFRACCIONES_HTTP_HOST || HOST_POR_DEFECTO;

  const textoTimeout = env.INFRACCIONES_TIMEOUT_SEGUNDOS ?? '';
  let segundos = TIMEOUT_POR_DEFECTO_SEG;
  if (textoTimeout !== '') {
    segundos = Number(textoTimeout);
    if (!Number.isFinite(segundos) || segundos <= 0) {
      throw new ErrorConfiguracion('INFRACCIONES_TIMEOUT_SEGUNDOS debe ser un número mayor que cero.');
    }
  }

  return { puerto, host, timeoutMs: segundos * 1000 };
}

/**
 * Arranca el servidor con la configuración de entorno y lo deja escuchando.
 * Resuelve con el servidor ya escuchando; rechaza si el puerto no está disponible.
 */
function arrancar(env = process.env, { log = () => {} } = {}) {
  // La configuración se lee dentro de la promesa: un valor inválido la rechaza en vez de lanzar síncrono.
  return new Promise((resolver, rechazar) => {
    const { puerto, host, timeoutMs } = leerConfiguracion(env);
    const servidor = crearServidor({ timeoutMs, log });
    servidor.once('error', rechazar);
    servidor.listen(puerto, host, () => resolver(servidor));
  });
}

if (require.main === module) {
  const log = mensaje => process.stderr.write(`[infracciones-http] ${mensaje}\n`);
  arrancar(process.env, { log })
    .then(servidor => {
      const { address, port } = servidor.address();
      log(`escuchando en ${address}:${port}`);
    })
    .catch(err => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = 2;
    });
}

module.exports = {
  crearServidor,
  leerConfiguracion,
  arrancar,
  RUTA,
  TIMEOUT_POR_DEFECTO_MS,
  HOST_POR_DEFECTO,
  PUERTO_POR_DEFECTO,
};
