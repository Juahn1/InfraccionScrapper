# infraccion-scrapper

Consulta las infracciones de tránsito asociadas a una patente en el sitio público de la Agencia Nacional de Seguridad Vial (ANSV) y devuelve un JSON con las actas, el tipo de infracción y el subtotal adeudado.

> **Advertencia de datos personales:** la salida contiene multas asociadas a una patente. Tratá el JSON y cualquier archivo que lo contenga como dato personal. El log de ejecución no incluye patente, números de acta ni importes.

## Requisitos

- Node.js 18 o superior.
- Conexión a internet.

## Instalación

```bash
npm install
npx playwright install chromium
```

## Uso

```bash
node src/cli.js AAA111
```

Para guardar el resultado en un archivo:

```bash
node src/cli.js AAA111 > resultado.json
```

### Formato de salida

```json
{
  "dominio": "AAA111",
  "infracciones": [
    {
      "numeroActa": "...",
      "dominio": "AAA111",
      "importe": 33150,
      "importeSinDescuento": 39000,
      "tipoInfraccion": "LEY ... - Artículo: ... - Descripción completa",
      "lugar": "...",
      "juzgado": "..."
    }
  ],
  "subtotal": 51500.5
}
```

- `importe`: monto del encabezado de la acta. Si la acta tiene pago voluntario con descuento, puede ser menor que `importeSinDescuento`.
- `importeSinDescuento`: `null` cuando el sitio no informa descuento para esa acta.
- `subtotal`: suma de los importes sin descuento de todas las actas (si un acta no informa uno, se usa su importe).
- El orden de las actas no está garantizado entre consultas: el sitio no lo fija. Para comparar resultados, usá `numeroActa` y no la posición en la lista.
- Una patente sin multas devuelve `infracciones: []`, `subtotal: 0` y el campo `mensaje: "Este auto no tiene multas registradas"`.

### Códigos de salida

| Código | Significado |
| --- | --- |
| 0 | Consulta correcta |
| 1 | Error de consulta: el sitio no respondió, o su estructura cambió |
| 2 | Uso incorrecto (falta la patente) |

## Alcance

- Consulta por patente (dominio). No consulta por DNI.
- Una patente por ejecución.
- Usa un navegador real (Chromium vía Playwright) para ejecutar la página como lo haría una persona.

## Uso desde código

```js
const { consultarInfraccionesPorDominio } = require('./src/index');

const resultado = await consultarInfraccionesPorDominio('AAA111');
console.log(resultado.subtotal);
```

Lanza `ErrorValidacionPatente`, `ErrorSitioNoDisponible` o `ErrorEstructuraNoReconocida` (definidos en `src/errors.js`) según la causa del fallo.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Muestra `Uso: infracciones <patente>` (código 2) | Falta la patente | Pasar la patente como argumento |
| `Error: La patente no puede estar vacía.` (código 1) | La patente son solo espacios | Pasar una patente real |
| `La patente no puede tener más de 7 caracteres.` | Patente demasiado larga | Revisar la patente |
| `tipo=ErrorSitioNoDisponible` | El sitio no respondió, devolvió 5xx o superó el tiempo de espera | Reintentar más tarde; verificar que el sitio abre en el navegador |
| `tipo=ErrorEstructuraNoReconocida` | El sitio cambió su HTML | Revisar `src/parse.js` y los fixtures; correr las pruebas en vivo |
| No se encuentra Chromium | No se instaló el navegador de Playwright | Ejecutar `npx playwright install chromium` |

Si el comando devuelve `infracciones: []` con `mensaje`, la patente no tiene multas registradas: no es un error.

## Pruebas

```bash
npm test                      # 20 pruebas unitarias: parseo, formato, validación, CLI
npm run test:e2e              # 16 pruebas end-to-end con la red del sitio simulada (no consultan el sitio)
RUN_LIVE=1 npm run test:e2e   # 20 pruebas end-to-end, incluidas 4 contra el sitio real
```

- Las pruebas unitarias y las simuladas no requieren conexión al sitio. Usan fixtures sintéticos en `test/fixtures/`.
- Las pruebas en vivo consultan el sitio real: ejecutarlas con moderación.
- Resultados documentados en [`docs/pruebas/RESULTADOS.md`](docs/pruebas/RESULTADOS.md), con las salidas crudas en `docs/pruebas/`.
