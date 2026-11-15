'use strict';

/**
 * Envuelve `consultar` para que solo corra una consulta a la vez y haya una pausa mínima entre una y otra.
 * Las consultas que llegan mientras otra está en curso esperan su turno, en orden.
 * `ahora` y `dormir` son inyectables para pruebas.
 */
function limitarConsultas(consultar, pausaMs, { ahora = Date.now, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let cola = Promise.resolve();
  let terminoLaUltima = null;

  return entrada => {
    const turno = cola.then(async () => {
      if (terminoLaUltima !== null) {
        const falta = terminoLaUltima + pausaMs - ahora();
        if (falta > 0) await dormir(falta);
      }
      try {
        return await consultar(entrada);
      } finally {
        terminoLaUltima = ahora();
      }
    });
    cola = turno.catch(() => {});
    return turno;
  };
}

module.exports = { limitarConsultas };
