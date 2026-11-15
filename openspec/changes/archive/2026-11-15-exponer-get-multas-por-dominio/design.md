# Design

## Context

El scraper ya expone `consultarInfraccionesPorDominio(entrada, opciones)` en `src/index.js`, que devuelve el JSON final y lanza errores tipados (`ErrorValidacionPatente`, `ErrorSitioNoDisponible`, `ErrorEstructuraNoReconocida`). La CLI en `src/cli.js` ya traduce esos errores a códigos de salida. Cada consulta levanta Chromium vía Playwright en `src/fetch.js` (`buscarPorDominio`), y ese módulo usa `TIMEOUT_MS = 60000` por operación, con el navegador cerrado en un `finally`.

Medición de referencia (ver `docs/pruebas/salida-e2e-en-vivo.txt`): consultas reales entre 3,3 s y 6,5 s. Los timeouts por paso de 60 s nunca limitan el tiempo total: una consulta puede encadenar varios pasos y superar holgadamente 10 s. Por eso el deadline total tiene que vivir en el servidor, no en `fetch.js`.

Ver `proposal.md` (Why y What Changes) para la motivación y `specs/consulta-infracciones-http/spec.md` para los requisitos.

## Goals / Non-Goals

**Goals:**
- Un único endpoint GET que reutiliza `consultarInfraccionesPorDominio` sin duplicar lógica de parseo ni formato.
- Un deadline total de 10 s por request que de verdad cancele la consulta y libere el navegador.
- Mapeo de errores tipados a códigos HTTP sin parsear mensajes.

**Non-Goals:**
- Autenticación, HTTPS, exposición en red o CORS.
- Pool de navegadores, caché o consultas concurrentes.
- Cambios en parseo, formato, validación de patente o CLI.

## Decisions

**1. Servidor con el módulo `http` nativo de Node.**
Se evita agregar dependencias para un único endpoint. Alternativa descartada: Express, que suma una dependencia para dos rutas (una real y un 404).

**2. Archivo nuevo `src/server.js`, con `main` exportado como la CLI.**
Mantiene el mismo patrón de `src/cli.js`: una función `crearServidor({ consultar, timeoutMs, ... })` inyectable para pruebas, y un bloque `if (require.main === module)` que arranca el servidor. `src/index.js` no cambia.

**3. Deadline total implementado con cancelación real, no solo con `Promise.race`.**
Un `Promise.race` contra un `setTimeout` respondería 504 a tiempo, pero la consulta seguiría corriendo en segundo plano con su navegador abierto. Como las consultas son secuenciales, la siguiente petición quedaría esperando detrás de una operación fantasma. La decisión es agregar una opción `signal` (AbortSignal) a `buscarPorDominio`: al dispararse la señal se cierra el navegador (lo que hace caer las operaciones de Playwright en curso) y el error se propaga. `consultarInfraccionesPorDominio` pasa la señal sin cambiar su firma pública más allá de esa opción.
- Alternativa descartada: solo `Promise.race`. Libera la respuesta pero no el recurso.

**4. Cola secuencial con una promesa encadenada.**
Cada request espera la promesa de la anterior (`cola = cola.then(...)`). Es suficiente para el volumen esperado y no requiere librerías. Si la señal de timeout dispara durante la espera en cola, esa request responde 504 sin ejecutar la consulta.

**5. Configuración por variables de entorno.**
- `INFRACCIONES_HTTP_PORT`: puerto, default `3000`.
- `INFRACCIONES_HTTP_HOST`: default `127.0.0.1`. Documentada como override explícito, con la advertencia de datos personales en el README.
- `INFRACCIONES_TIMEOUT_SEGUNDOS`: timeout total, default `10`. Valores no numéricos o menores o iguales a cero se rechazan al arrancar, en lugar de caer silenciosamente al default.

**6. Mapeo de errores por `instanceof` / `err.name`.**
`ErrorValidacionPatente` → 400, `ErrorSitioNoDisponible` → 502, `ErrorEstructuraNoReconocida` → 422, timeout propio → 504. Cualquier otro error → 500 con mensaje genérico y log del tipo.

**7. Logs con la misma restricción que la CLI.**
Se escribe a stderr solo `estado`, `actas` o `tipo` de error, sin patente ni importes. Se reutiliza el formato `[infracciones] ...` de la CLI.

## Risks / Trade-offs

- **[Timeout de 10 s demasiado ajustado frente a una consulta de 3 a 7 s medida]** → Mitigación: valor configurable por variable de entorno; si aparecen 504 seguidos, se sube sin tocar código. Verificar con unas 10 consultas reales antes de dar el change por cerrado.
- **[Cancelación parcial del navegador al cerrarlo]** → Mitigación: el test de cierre del navegador ya existe (pruebas 13 y 14); se agrega un caso que dispara la señal en mitad de una consulta simulada y verifica que el navegador se cierra.
- **[Endpoint sin autenticación con datos personales]** → Mitigación: bind por defecto a 127.0.0.1; el README advierte que exponerlo en red es responsabilidad de quien lo configure.
- **[Cola secuencial crece si el sitio se vuelve lento]** → Mitigación: con el timeout de 10 s, una request no puede ocupar la cola más de ese tiempo; las que esperan en cola también vencen con 504.
- **[Cambio en `buscarPorDominio`]** → Mitigación: la opción `signal` es opcional; sin ella el comportamiento actual no cambia y las pruebas existentes siguen valiendo.

## Migration Plan

No hay datos ni estado persistente que migrar. El cambio es aditivo: la CLI y la librería siguen funcionando igual. Rollback: quitar `src/server.js`, la opción `signal` y la sección del README.

## Open Questions

Ninguna que cambie specs, enfoque o tareas. El rango de puerto por defecto (3000) es una convención que puede ajustarse sin impacto.
