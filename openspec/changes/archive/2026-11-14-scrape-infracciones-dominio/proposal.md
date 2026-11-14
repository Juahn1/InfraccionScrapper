# Proposal

## Why

El proyecto arranca sin código. Se necesita un scraper que, dada una patente (dominio), consulte el sistema público de infracciones de la ANSV (SINAI) y devuelva un JSON con las infracciones del vehículo y el subtotal adeudado. Hoy la consulta solo se puede hacer manualmente, acta por acta, desde el sitio.

## What Changes

- Crear un scraper que, para una patente, ejecute el flujo de búsqueda por dominio del sitio `consultainfracciones.seguridadvial.gob.ar` en un navegador automatizado (Playwright).
- Extraer de cada acta el número de acta, el dominio, el importe, el importe sin descuento (cuando exista), el tipo de infracción en texto completo, el lugar de la infracción y el juzgado de radicación.
- Emitir un JSON por patente con: `dominio`, `infracciones` (lista de actas) y `subtotal`.
- `subtotal` = suma de los importes **sin descuento** de cada acta.
- Los montos se parsean desde formato argentino (punto como separador de miles, coma decimal) a número.
- Los datos son personales (multas asociadas a patentes): los logs y fixtures no deben contenerlos en claro.
- Fuera de alcance en esta iteración: consultas por DNI, consultas en lote, persistencia en base de datos, interfaz gráfica.

## Capabilities

### New Capabilities

- `consulta-infracciones-dominio`: consulta de infracciones por patente en el sitio de la ANSV y su transformación al JSON de salida (dominio, actas con tipo, lugar, juzgado e importes, y subtotal sin descuento).

### Modified Capabilities

Ninguna. No existen specs previas en `openspec/specs/`.

## Impact

- Código nuevo en el repositorio (aún no existe); se asume stack Node.js con Playwright, ya validado en la fase de exploración.
- Dependencia externa: el sitio público de la ANSV. Su estructura HTML (ids de ASP.NET como `rptResultados_ctlNN`, `lblnroActa`, `pnlImporteTotal`) puede cambiar sin aviso.
- Dependencia de reCAPTCHA v3: el script se ejecuta en el navegador; no se verificó si el servidor valida el token. Se asume que el flujo con navegador real funciona, según la validación del usuario.
- Riesgo de privacidad: la salida contiene datos personales.
