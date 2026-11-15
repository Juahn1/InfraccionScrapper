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

## Servicio de multas por Kafka

Además de la librería y la CLI, el repo es el servicio **`multas`** del ecosistema CRM: atiende los comandos del orquestador por Kafka y le responde con eventos. Contrato completo: `docs/08-contrato-tres-topicos.md` (§3, §4 y §7) del repositorio del orquestador.

```bash
pnpm install
pnpm exec playwright install chromium   # solo la primera vez, para consultar la ANSV de verdad
pnpm start                              # lee las variables de .env.example (exportadas en el entorno)
```

```text
orquestador ──ConsultarMultas──► crm.comandos ──► multas ──consulta la ANSV (Playwright)
multas ──MultasConsultadas / ConsultaMultasFallida──► crm.eventos ──► orquestador
```

| Mensaje | Dónde | Contenido |
| --- | --- | --- |
| `ConsultarMultas` (entra) | `crm.comandos`, `destino: multas` | `vehiculoId`, `patente`. Los comandos con otro `destino` u otro `eventType` se ignoran |
| `MultasConsultadas` (sale) | `crm.eventos`, clave `vehiculoId` | `vehiculoId`, `dominio`, `infracciones[]`, `subtotal` y, sin multas, `mensaje`. Una patente sin multas es un resultado válido |
| `ConsultaMultasFallida` (sale) | `crm.eventos`, clave `vehiculoId` | `vehiculoId`, `motivo`, `reintentable` |

- Los mensajes llevan el sobre común (`eventId`, `eventType`, `version`, `occurredAt`, `timestamp`, `correlationId`, `payload`) y la respuesta conserva el `correlationId` del comando.
- **Errores de la consulta:** `ErrorSitioNoDisponible` → `SITIO_NO_DISPONIBLE`, reintentable (el orquestador reintenta con espera creciente); `ErrorEstructuraNoReconocida` → `ESTRUCTURA_NO_RECONOCIDA`, no reintentable (el sitio cambió: hay que alertar y revisar los selectores); `ErrorValidacionPatente` → `PATENTE_INVALIDA`, no reintentable.
- **Errores inesperados** (o no poder publicar la respuesta): se reintenta `KAFKA_REINTENTOS_COMANDO` veces con espera creciente y después el comando va a `crm.dlt` tal como llegó. Un mensaje que no es JSON, o sin `vehiculoId`, va directo a la DLT.
- **Concurrencia:** una consulta a la vez, con una pausa mínima de `MULTAS_PAUSA_ENTRE_CONSULTAS_SEGUNDOS` entre una y otra.
- **Datos personales:** el log del servicio no incluye patente, actas ni importes (solo el `vehiculoId`, el estado, el motivo y la cantidad de actas).
- `GET /health` en `PORT` (`UP` cuando el consumidor está conectado).
- Aiven no crea tópicos solos: el servicio crea los tres al arrancar.

Los tests (`pnpm test`) cubren el manejador, el sobre, el limitador y la configuración con dobles de prueba; no tocan la ANSV ni Kafka.
