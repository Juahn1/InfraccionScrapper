'use strict';

const cheerio = require('cheerio');

// Estados posibles del parseo de una página de resultados.
const ESTADO = Object.freeze({
  CON_ACTAS: 'con_actas',
  SIN_ACTAS: 'sin_actas',
  ESTRUCTURA_NO_RECONOCIDA: 'estructura_no_reconocida',
});

const LABELS = {
  infracciones: /^Infracciones/i,
  lugar: /^Lugar de la infracci/i,
  juzgado: /^Juzgado de radicaci/i,
};

// Sin "bloque de resultados" ni formulario de búsqueda no hay forma de interpretar la página.
function detectarEstructura($) {
  const tieneContenedor = $('#divGrilla').length > 0;
  const tieneFormulario = $('#btnBuscarFake').length > 0 || $('[id$="_txDominio"]').length > 0;
  return tieneContenedor || tieneFormulario;
}

// Lee el texto de los <span class="repeaterBody"> dentro del <li> que corresponde a una etiqueta.
function valorDeEtiqueta($, $panel, etiqueta) {
  const li = $panel
    .find('.panel-collapse li')
    .filter((_, el) => etiqueta.test($(el).find('b').first().text().trim()))
    .first();
  if (!li.length) return null;
  const valor = li.find('.repeaterBody').first().text().replace(/\s+/g, ' ').trim();
  return valor || null;
}

// Texto de importe del encabezado: "Importe: $ 39.000,00" -> "$ 39.000,00" (formato sin convertir).
function importeEncabezado($, $panel) {
  const texto = $panel.find('[id$="_pnlImporteTotal"]').text().replace(/\s+/g, ' ').trim();
  const m = texto.match(/\$\s*[\d.]+,\d{2}/);
  return m ? m[0] : null;
}

// Importe sin descuento, si la acta trae la línea "Tipo de Pago Voluntario Con Descuento".
function importeSinDescuento($, $panel) {
  const lineas = $panel.find('.panel-collapse li').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  const linea = lineas.find(t => /Tipo de Pago/i.test(t));
  if (!linea) return null;
  const m = linea.match(/Importe Total sin Descuento:\s*(\$?\s*[\d.]+,\d{2})/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function parseActa($, el) {
  const $lbl = $(el);
  const $panel = $lbl.closest('.panel');
  return {
    numeroActa: $lbl.text().trim() || null,
    dominio: $panel.find('[id$="_labelDominio"] label').first().text().trim() || null,
    importeEncabezado: importeEncabezado($, $panel),
    importeSinDescuento: importeSinDescuento($, $panel),
    tipoInfraccion: valorDeEtiqueta($, $panel, LABELS.infracciones),
    lugar: valorDeEtiqueta($, $panel, LABELS.lugar),
    juzgado: valorDeEtiqueta($, $panel, LABELS.juzgado),
  };
}

/**
 * Interpreta el HTML de la página posterior a la búsqueda por dominio.
 * Devuelve el estado y, cuando hay actas, la lista de actas con texto sin convertir.
 * No convierte montos: esa responsabilidad es de format.js.
 */
function parseResultados(html) {
  const $ = cheerio.load(html);

  if (!detectarEstructura($)) {
    return { estado: ESTADO.ESTRUCTURA_NO_RECONOCIDA, actas: [] };
  }

  const actas = $('[id$="_lblnroActa"]').map((_, el) => parseActa($, el)).get();
  return {
    estado: actas.length > 0 ? ESTADO.CON_ACTAS : ESTADO.SIN_ACTAS,
    actas,
  };
}

module.exports = { parseResultados, ESTADO };
