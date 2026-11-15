# Tasks

## 1. Cancelación de la consulta en fetch.js

- [x] 1.1 Agregar la opción `signal` a `buscarPorDominio` que, al dispararse, cierre el navegador y propague un error de tipo timeout; verificar con una prueba simulada que la señal disparada en mitad de la consulta cierra el navegador y que sin señal el comportamiento actual no cambia (las pruebas 01 a 16 siguen pasando).
- [x] 1.2 Pasar la opción `signal` desde `consultarInfraccionesPorDominio` en `src/index.js` sin cambiar su comportamiento para quien no la usa; verificar con `npm test` que las pruebas unitarias existentes siguen pasando.

## 2. Servidor HTTP con validación, errores y timeout

- [x] 2.1 Crear `src/server.js` con `crearServidor({ consultar, timeoutMs })` que atienda `GET /getMultasPorDominio?dominio=` y devuelva el JSON de la consulta con 200; verificar con una prueba que una consulta simulada devuelve el JSON esperado.
- [x] 2.2 Validar el parámetro `dominio` y responder 400 cuando falte, esté vacío o tenga más de 7 caracteres, sin invocar la consulta; responder 404 o 405 para otras rutas o métodos. Verificar con pruebas que cada caso devuelve su código sin llamar a `consultar`.
- [x] 2.3 Mapear `ErrorSitioNoDisponible` a 502, `ErrorEstructuraNoReconocida` a 422 y cualquier otro error a 500 con mensaje genérico; verificar con una prueba por tipo de error que el cuerpo no contiene subtotal.
- [x] 2.4 Implementar el timeout total por request con `AbortController`: al vencerse, cancelar la consulta mediante la señal y responder 504 con mensaje de vencimiento del tiempo total; verificar con una consulta simulada que tarda más que el timeout de prueba que la respuesta es 504 y que el navegador simulado se cerró.
- [x] 2.5 Atender las consultas de a una con una cola secuencial; verificar con dos peticiones simultáneas que ambas responden y que la segunda no inicia hasta terminar la primera.
- [x] 2.6 Escribir a stderr solo estado, cantidad de actas o tipo de error, sin patente, números de acta ni importes; verificar con una prueba que el log de una consulta exitosa y de una fallida no contiene la patente simulada.
- [x] 2.7 Agregar `src/server.js` a los tests unitarios con `npm test` y verificar que la suite completa pasa.

## 3. Configuración, arranque y documentación

- [x] 3.1 Leer `INFRACCIONES_HTTP_PORT` (default 3000), `INFRACCIONES_HTTP_HOST` (default 127.0.0.1) e `INFRACCIONES_TIMEOUT_SEGUNDOS` (default 10); rechazar al arrancar un timeout no numérico o menor o igual a cero. Verificar con pruebas de configuración y que sin variables el servidor escucha solo en 127.0.0.1.
- [x] 3.2 Agregar el bloque de arranque `if (require.main === module)` en `src/server.js` y un script `npm run servidor` en `package.json`; verificar que `npm run servidor` levanta el servidor y responde 400 a `GET /getMultasPorDominio` sin parámetro.
- [x] 3.3 Actualizar el README con el uso del endpoint, las variables de entorno, los códigos de respuesta y la advertencia de datos personales; verificar que los ejemplos del README coinciden con las respuestas reales de los tests.

## 4. Verificación de integración

- [x] 4.1 Ejecutar unas 10 consultas reales contra el endpoint con `RUN_LIVE=1` y registrar en `docs/pruebas/RESULTADOS.md` la duración de cada una y cuántas dieron 504 con el timeout de 10 segundos; verificar que el resultado queda documentado sin datos de actas.

## Workflow follow-up

- Revisar el resultado de la tarea 4.1: si aparecen 504 frecuentes, subir el valor por defecto en el design antes de archivar.
- Archivar el change una vez completadas las tareas 1 a 4.
