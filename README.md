# infraccion-scrapper

Consulta las infracciones de tránsito asociadas a una patente en el sitio público de la Agencia Nacional de Seguridad Vial (ANSV) y devuelve un JSON con las actas, el tipo de infracción y el subtotal adeudado.

> **Advertencia de datos personales:** la salida contiene multas asociadas a una patente. Tratá el JSON y cualquier archivo que lo contenga como dato personal. El log de ejecución no incluye patente, números de acta ni importes.

## Requisitos

- Node.js 18 o superior.
- Conexión a internet.

## Instalación

```bash
pnpm install
pnpm exec playwright install chromium
```

## Uso

```bash
pnpm exec node src/cli.js AAA111
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
- Una patente por ejecución en la CLI. El servidor HTTP atiende una consulta a la vez.
- Se puede usar desde la CLI, desde código o mediante un endpoint HTTP local (`GET /getMultasPorDominio`); ver [Servidor HTTP](#servidor-http). El endpoint es un proceso aparte del servicio Kafka y no depende de él.
- Usa un navegador real (Chromium vía Playwright) para ejecutar la página como lo haría una persona.

## Uso desde código

```js
const { consultarInfraccionesPorDominio } = require('./src/index');

const resultado = await consultarInfraccionesPorDominio('AAA111');
console.log(resultado.subtotal);
```

Lanza `ErrorValidacionPatente`, `ErrorSitioNoDisponible` o `ErrorEstructuraNoReconocida` (definidos en `src/errors.js`) según la causa del fallo.

## Servidor HTTP

Servicio HTTP paralelo al servicio de Kafka: es otro proceso, con su propio punto de entrada (`src/server.js`) y su propia configuración. No importa nada de `src/kafka/`, no usa `PORT` ni consume de Kafka, y el servicio `multas` no depende de él.

> **Advertencia de datos personales:** el endpoint devuelve multas asociadas a una patente y no tiene autenticación. Por defecto escucha solo en `127.0.0.1`. Exponerlo en la red es una decisión tuya y queda bajo tu responsabilidad.

Arranque:

```bash
pnpm run servidor
```

Consulta:

```bash
curl "http://127.0.0.1:3000/getMultasPorDominio?dominio=AAA111"
```

La respuesta 200 es el mismo JSON de la sección de salida, con `dominio`, `infracciones` y `subtotal`. Una patente sin multas devuelve `subtotal: 0` y el campo `mensaje`.

### Variables de entorno

| Variable | Default | Qué hace |
| --- | --- | --- |
| `INFRACCIONES_HTTP_PORT` | `3000` | Puerto donde escucha el servidor |
| `INFRACCIONES_HTTP_HOST` | `127.0.0.1` | Dirección de escucha. Cambiarla expone el endpoint en esa interfaz |
| `INFRACCIONES_TIMEOUT_SEGUNDOS` | `10` | Tiempo total por consulta, incluida la espera en cola. Debe ser mayor que cero |

Un valor inválido impide arrancar el servidor (código de salida 2) y el error indica la variable.

### Códigos de respuesta

| Código | Cuándo | Cuerpo `error` |
| --- | --- | --- |
| 200 | Consulta correcta (también si no hay multas) | — |
| 400 | Falta `dominio`, está vacío o tiene más de 7 caracteres | `Parámetro dominio inválido.` |
| 404 | Otra ruta distinta de `/getMultasPorDominio` | `Ruta no encontrada.` |
| 405 | Método distinto de GET (la respuesta incluye `Allow: GET`) | `Método no permitido.` |
| 422 | El sitio cambió su estructura | `La página del sitio no tiene la estructura esperada; posible cambio del sitio.` |
| 500 | Error interno | `Error interno al consultar.` |
| 502 | El sitio no respondió o devolvió un error del servidor | `Falla del sitio de consulta.` |
| 504 | Se venció el tiempo total de la consulta; el navegador se cierra | `Se venció el tiempo total de la consulta.` |

Las consultas se atienden de a una, en orden de llegada. El log de cada request solo muestra estado, cantidad de actas o tipo de error: nunca la patente, números de acta ni importes.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Muestra `Uso: infracciones <patente>` (código 2) | Falta la patente | Pasar la patente como argumento |
| `Error: La patente no puede estar vacía.` (código 1) | La patente son solo espacios | Pasar una patente real |
| `La patente no puede tener más de 7 caracteres.` | Patente demasiado larga | Revisar la patente |
| `tipo=ErrorSitioNoDisponible` | El sitio no respondió, devolvió 5xx o superó el tiempo de espera | Reintentar más tarde; verificar que el sitio abre en el navegador |
| `tipo=ErrorEstructuraNoReconocida` | El sitio cambió su HTML | Revisar `src/parse.js` y los fixtures; correr las pruebas en vivo |
| No se encuentra Chromium | No se instaló el navegador de Playwright | Ejecutar `pnpm exec playwright install chromium` |

Si el comando devuelve `infracciones: []` con `mensaje`, la patente no tiene multas registradas: no es un error.

## Pruebas

```bash
pnpm test                      # pruebas unitarias: parseo, formato, validación, CLI, cancelación, servidor HTTP y configuración
pnpm run test:e2e             # 16 pruebas end-to-end con la red del sitio simulada (no consultan el sitio)
RUN_LIVE=1 pnpm run test:e2e  # 20 pruebas end-to-end, incluidas 4 contra el sitio real
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

### Docker

```bash
docker build -t multas .
docker run --rm -p 8087:8087 --env-file .env multas
```

- La imagen parte de la oficial de Playwright (trae Chromium) con la **misma versión que el `playwright` de package.json** y fijada por digest: si se actualiza uno, se actualiza el otro.
- Corre con el usuario sin privilegios `pwuser`. Con ese usuario Chromium no puede armar su sandbox, por eso la imagen define `CHROMIUM_SIN_SANDBOX=true` (la CLI y el servicio lo leen). Fuera de Docker no hace falta.
- Pesa unos 3,7 GB. Medido con 512 MB de límite (como Render free): una consulta real usa unos 290 MiB de pico, sin OOM.
- `HEALTHCHECK` contra `/health`.
