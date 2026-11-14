# Resultados de pruebas end-to-end con Playwright

**Fecha:** 2026-11-14
**Entorno:** Windows 11 Pro, Node.js 24.18.0, Playwright 1.65.1 (Chromium administrado por Playwright)
**Comandos:**

```bash
npm test                              # 20 pruebas unitarias (parseo, formato, validación, CLI)
npm run test:e2e                      # 16 pruebas e2e sin red (red del sitio simulada)
RUN_LIVE=1 npm run test:e2e           # 20 pruebas e2e: las 16 anteriores + 4 en vivo
```

**Salidas crudas:**
- `docs/pruebas/salida-e2e-sin-red.txt`
- `docs/pruebas/salida-e2e-en-vivo.txt`

## Resumen

| Corrida | Pruebas | Pasan | Fallan | Omitidas |
| --- | --- | --- | --- | --- |
| Unitarias (`npm test`) | 20 | 20 | 0 | 0 |
| E2E sin red (`npm run test:e2e`) | 20 (16 activas) | 16 | 0 | 4 (en vivo) |
| E2E con sitio real (`RUN_LIVE=1`) | 20 | 20 | 0 | 0 |

## Detalle de las 20 pruebas e2e

Las pruebas 01 a 16 usan Chromium real con las peticiones al sitio interceptadas: no consultan el sitio. Las pruebas 17 a 20 consultan el sitio real y solo corren con `RUN_LIVE=1`.

| # | Prueba | Tipo | Resultado |
| --- | --- | --- | --- |
| 01 | Flujo completo: dominio, dos actas y subtotal 51500.5 | Simulada | Pasa |
| 02 | Acta con descuento: importe del encabezado e importe sin descuento se separan | Simulada | Pasa |
| 03 | Acta sin descuento: importeSinDescuento es null | Simulada | Pasa |
| 04 | Tipo de infracción completo, lugar y juzgado | Simulada | Pasa |
| 05 | Montos del JSON son números | Simulada | Pasa |
| 06 | Patente sin actas: lista vacía, subtotal 0 y mensaje, sin error | Simulada | Pasa |
| 07 | Página ajena: estructura no reconocida, sin esperar al timeout | Simulada | Pasa |
| 08 | Respuesta 500 a la búsqueda: sitio no disponible | Simulada | Pasa |
| 09 | Respuesta 503 al cargar: sitio no disponible | Simulada | Pasa |
| 10 | Búsqueda abortada por la red: sitio no disponible | Simulada | Pasa |
| 11 | Respuesta más lenta que el timeout: sitio no disponible | Simulada | Pasa |
| 12 | Patente de 8 caracteres rechazada sin abrir el navegador ni tocar el sitio | Simulada | Pasa |
| 13 | El navegador se cierra tras una consulta exitosa | Simulada | Pasa |
| 14 | El navegador se cierra aunque la consulta falle | Simulada | Pasa |
| 15 | CLI con flujo simulado: código 0 y JSON válido por stdout | Simulada | Pasa |
| 16 | CLI con falla del sitio: código 1, stdout vacío, log sin la patente | Simulada | Pasa |
| 17 | Patente autorizada: hay actas y cada una trae número, importe, tipo, lugar y juzgado | En vivo | Pasa |
| 18 | Consultas repetidas: mismo conjunto de actas y mismo subtotal | En vivo | Pasa |
| 19 | Patente sin actas: mensaje y subtotal 0 | En vivo | Pasa |
| 20 | Patente sin actas (segunda patente): mensaje y subtotal 0 | En vivo | Pasa |

## Hallazgo durante estas pruebas (corregido)

Al escribir las pruebas se encontró un problema en `src/fetch.js`:

- **Síntoma:** después de enviar la búsqueda, la función esperaba el contenedor `#divGrilla` con `waitForSelector`. Ese contenedor ya existe antes de buscar, así que la espera podía pasar de inmediato y leer la página anterior. Además, una página ajena hacía esperar el timeout completo (60 s) antes de reportar el error.
- **Corrección:** el HTML de resultados se toma del cuerpo de la respuesta al POST de la búsqueda. Se agregó `timeoutMs` configurable.
- **Verificación:** la prueba 07 comprueba que el error de estructura se reporta sin esperar al timeout. Las pruebas en vivo 17 a 20 confirman que la consulta real sigue funcionando con el cambio.

## Notas sobre datos personales

- Las pruebas en vivo consultan dos patentes sin actas y una patente autorizada por el usuario. Esta documentación no incluye montos, números de acta ni lugares de las actas.
- Las salidas crudas no contienen datos de actas: los títulos de las pruebas y los mensajes son genéricos.

## Limitaciones

- Las pruebas simuladas validan la lógica del flujo, pero no detectan cambios en el sitio real: para eso están las pruebas en vivo.
- Las pruebas en vivo dependen de la disponibilidad del sitio y de que las patentes autorizadas sigan teniendo actas; la prueba 17 comprueba que haya actas, sin fijar cantidad.
- No se probó si el servidor exige el token de reCAPTCHA: el flujo funciona en un navegador real y no se intentó eludir el script.
