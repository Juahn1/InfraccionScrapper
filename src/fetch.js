'use strict';

const { chromium } = require('playwright');
const { validarPatente } = require('./validar');
const { ErrorSitioNoDisponible, ErrorTiempoAgotado } = require('./errors');

const URL_SITIO = 'https://consultainfracciones.seguridadvial.gob.ar/';
const SEL = {
  tabDominio: '#ctl00_ContentPlaceHolder1_dDominio',
  campoDominio: '#ctl00_ContentPlaceHolder1_txDominio',
  botonBuscar: '#btnBuscarFake',
};
const TIMEOUT_MS = 60000;

/**
 * Ejecuta la búsqueda por dominio en el sitio y devuelve el HTML de la página de resultados.
 * - La patente se valida antes de abrir el navegador (si es inválida no se lanza nada).
 * - El HTML sale del cuerpo de la respuesta al POST de la búsqueda, no del DOM de la página:
 *   el contenedor de resultados ya existe antes de buscar, así que leer el DOM podría dar la página vieja.
 * - `lanzarNavegador` y `timeoutMs` son inyectables para pruebas.
 * - `signal` (AbortSignal) cancela la consulta: al dispararse se cierra el navegador
 *   y se lanza ErrorTiempoAgotado. Sin señal el comportamiento no cambia.
 * - Falla del sitio (no responde, 5xx o timeout) -> ErrorSitioNoDisponible.
 */
async function buscarPorDominio(entrada, {
  // CHROMIUM_SIN_SANDBOX=true: dentro de un contenedor sin privilegios Chromium no puede armar su sandbox.
  lanzarNavegador = () => chromium.launch({ headless: true, chromiumSandbox: process.env.CHROMIUM_SIN_SANDBOX !== 'true' }),
  timeoutMs = TIMEOUT_MS,
  signal,
} = {}) {
  const patente = validarPatente(entrada);
  if (signal?.aborted) throw new ErrorTiempoAgotado();

  let navegador;
  try {
    navegador = await lanzarNavegador();
  } catch (err) {
    throw new ErrorSitioNoDisponible(`No se pudo iniciar el navegador: ${err.message}`);
  }

  // Cerrar el navegador hace fallar las operaciones de Playwright en curso.
  const alAbortar = () => { navegador.close().catch(() => {}); };
  if (signal) signal.addEventListener('abort', alAbortar, { once: true });

  try {
    const pagina = await navegador.newPage();
    pagina.on('dialog', d => d.accept());

    const respuestaInicial = await pagina.goto(URL_SITIO, { waitUntil: 'load', timeout: timeoutMs });
    if (!respuestaInicial || respuestaInicial.status() >= 500) {
      throw new ErrorSitioNoDisponible(`El sitio respondió ${respuestaInicial ? respuestaInicial.status() : 'sin respuesta'} al cargar.`);
    }

    await pagina.click(SEL.tabDominio, { timeout: timeoutMs });
    await pagina.fill(SEL.campoDominio, patente, { timeout: timeoutMs });

    // Se espera el POST de la búsqueda: el reCAPTCHA se ejecuta antes de enviarlo.
    const [respuestaBusqueda] = await Promise.all([
      pagina.waitForResponse(
        r => r.request().method() === 'POST' && r.url().startsWith(URL_SITIO),
        { timeout: timeoutMs }
      ),
      pagina.click(SEL.botonBuscar, { timeout: timeoutMs }),
    ]);

    if (respuestaBusqueda.status() >= 500) {
      throw new ErrorSitioNoDisponible(`El sitio respondió ${respuestaBusqueda.status()} a la búsqueda.`);
    }

    return await respuestaBusqueda.text();
  } catch (err) {
    if (signal?.aborted) throw new ErrorTiempoAgotado();
    if (err instanceof ErrorSitioNoDisponible) throw err;
    if (err.name === 'TimeoutError') {
      throw new ErrorSitioNoDisponible(`El sitio no respondió a tiempo: ${err.message.split('\n')[0]}`);
    }
    throw new ErrorSitioNoDisponible(`Falla al consultar el sitio: ${err.message.split('\n')[0]}`);
  } finally {
    if (signal) signal.removeEventListener('abort', alAbortar);
    await navegador.close().catch(() => {});
  }
}

module.exports = { buscarPorDominio, URL_SITIO, SEL };
