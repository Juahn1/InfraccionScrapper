# Tasks

## 1. Base del proyecto

- [x] 1.1 Crear `package.json` del proyecto y verificar que `npm install` completa sin errores
- [x] 1.2 Instalar `playwright` y el navegador Chromium (`npx playwright install chromium`) y verificar que `npx playwright --version` responde

## 2. Parseo de resultados (sin red)

- [x] 2.1 Crear fixtures HTML sintéticos (sin datos reales) que reproduzcan la estructura de `rptResultados_ctlNN`: una acta sin descuento, una con "Tipo de Pago Voluntario Con Descuento" y una patente sin actas; verificar que los fixtures existen en el repositorio
- [x] 2.2 Implementar el parseo de actas (número, dominio, importe del encabezado, importe sin descuento cuando exista, tipo de infracción completo, lugar y juzgado) y verificar con tests que cada campo se extrae correcto del fixture
- [x] 2.3 Implementar la detección de estructura no reconocida (página sin `#divGrilla` ni formulario de búsqueda) y verificar con el fixture `pagina-ajena.html` que devuelve un error de estructura y no un resultado vacío; verificar también con `sin-actas.html` que devuelve resultado vacío con el mensaje, no un error

## 3. Formato de montos y subtotal

- [x] 3.1 Implementar la conversión de montos argentinos a número y verificar con tests que "$ 39.000,00" da 39000 y que "$ 1.234.567,89" da 1234567.89
- [x] 3.2 Implementar el subtotal como suma de importes sin descuento (con fallback al importe del encabezado) y verificar con tests los escenarios de la spec: acta con descuento, acta sin descuento, patente sin actas (subtotal 0)

## 4. Automatización del flujo del sitio

- [x] 4.1 Implementar la capa de búsqueda: abrir el sitio, activar "BUSQUEDA POR DOMINIO", completar la patente, enviar y esperar el bloque de resultados o el error; verificar contra el sitio real con una patente autorizada por el usuario que el bloque de resultados aparece
- [x] 4.2 Implementar errores diferenciados de falla del sitio (no responde o HTTP 5xx) y verificar con una prueba que simula el fallo que el error es de tipo "sitio no disponible"
- [x] 4.3 Validar la entrada de patente: rechazar vacía o con más de 7 caracteres antes de tocar el sitio; verificar con un test que no se abre el navegador en ese caso

## 5. Decisión pendiente: patente inexistente

- [x] 5.1 Implementar el mensaje "Este auto no tiene multas registradas" en el campo `mensaje` cuando la lista de actas es vacía (con o sin actas en el sitio) y verificar con un test que una patente sin actas devuelve `infracciones: []`, `subtotal: 0` y ese mensaje, sin error

## 6. CLI, salida JSON y privacidad

- [x] 6.1 Implementar el comando de línea que recibe la patente y escribe el JSON por stdout con los campos `dominio`, `infracciones` y `subtotal`; verificar con un test que el JSON del fixture cumple la estructura de la spec
- [x] 6.2 Implementar el registro de ejecución sin datos personales (solo estado y cantidad de actas) y verificar con un test que el log de una consulta exitosa no contiene dominio, números de acta ni importes
- [x] 6.3 Documentar en `README.md` cómo instalar, cómo ejecutar el comando y la advertencia de datos personales en la salida; verificar que los comandos del README se ejecutan tal como están escritos

## 7. Verificación de integración

- [x] 7.1 Ejecutar el comando completo con una patente autorizada por el usuario y verificar que el JSON resultante coincide con lo que muestra la página para esa patente (cantidad de actas, importes sin descuento y subtotal)

## Workflow follow-up

- Archivar el cambio cuando las tareas estén completas y el usuario apruebe el resultado.
- Verificar el resultado archivado y la sincronización de la spec `consulta-infracciones-dominio`.
