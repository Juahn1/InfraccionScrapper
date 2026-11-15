# Proposal

## Why

Hoy la consulta de infracciones solo se puede usar desde la CLI o llamando a la función `consultarInfraccionesPorDominio` desde código Node.js. Para integrar el scraper con otras herramientas o procesos locales hace falta un punto de entrada HTTP sencillo: una petición GET por patente que devuelva el mismo JSON que ya produce el scraper.

## What Changes

- Agregar un servidor HTTP que expone `GET /getMultasPorDominio?dominio=<patente>`.
- La respuesta exitosa es el mismo JSON que devuelve `consultarInfraccionesPorDominio` (`dominio`, `infracciones`, `subtotal` y `mensaje` cuando no hay multas), sin cambios de formato.
- La patente se valida con las mismas reglas de la consulta actual (no vacía, máximo 7 caracteres). Una patente ausente o inválida responde 400 sin consultar el sitio.
- Timeout total por request de **10 segundos**, configurable por variable de entorno. Si se vence, se cierra el navegador y se responde 504 con un mensaje que indica vencimiento del tiempo total.
- Mapeo de errores tipados a códigos HTTP: falla del sitio → 502; estructura no reconocida → 422; vencimiento del timeout → 504.
- Una consulta a la vez: las peticiones se atienden de forma secuencial (volumen bajo esperado).
- El servidor escucha en `127.0.0.1` por defecto. El puerto es configurable por variable de entorno.
- Los logs del servidor no incluyen patente, números de acta ni importes, igual que la CLI.
- Actualizar el README con el uso del endpoint y sus códigos de respuesta.
- Fuera de alcance en esta iteración: autenticación, exposición en red, consultas en lote, pool de navegadores, caché de resultados, persistencia.

## Capabilities

### New Capabilities

- `consulta-infracciones-http`: exposición por HTTP GET de la consulta de infracciones por patente, con validación de entrada, timeout total por request y mapeo de errores a códigos HTTP.

### Modified Capabilities

Ninguna. El formato del JSON y el comportamiento de la consulta por patente (`consulta-infracciones-dominio`) no cambian; el endpoint los reutiliza tal como están.

## Impact

- Código nuevo: un módulo de servidor HTTP en `src/` que usa el módulo `http` nativo de Node.js (sin nuevas dependencias).
- Código existente: sin cambios en parseo, formato ni validación. `src/index.js` sigue siendo el punto de entrada de la consulta.
- README: sección de uso del endpoint, variables de entorno y códigos de respuesta.
- Dependencia externa sin cambios: el sitio público de la ANSV.
- Riesgo de privacidad: el endpoint devuelve datos personales y no tiene autenticación. Por eso escucha solo en localhost por defecto; exponerlo en red es una decisión aparte.
- Riesgo de latencia: el timeout de 10 s es ajustado frente a las consultas medidas (3 a 7 s). Si aparecen 504 con frecuencia, el valor se sube por variable de entorno sin cambios de código.
