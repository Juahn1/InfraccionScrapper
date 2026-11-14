# Design

## Context

El proyecto está vacío: no hay código, ni dependencias, ni tests. El sitio de la ANSV es una aplicación ASP.NET WebForms que resuelve la búsqueda por dominio mediante un postback, con un script de reCAPTCHA v3 que se ejecuta en el navegador antes de enviar el formulario. La fase de exploración validó con Playwright que el flujo completo funciona en un navegador real: activar la pestaña de búsqueda por dominio, completar el campo, enviar, y leer el resultado en la misma página. Un cliente HTTP directo no reproduce el flujo, porque el postback exige el estado de formulario generado por la página y el token de reCAPTCHA.

Ver `proposal.md` para el motivo y `specs/consulta-infracciones-dominio/spec.md` para los requisitos.

## Goals / Non-Goals

**Goals:**
- Obtener, por patente, el resultado estructurado definido en la spec.
- Usar la estructura de repetidores ASP.NET que ya se mapeó (`rptResultados_ctlNN`, `lblnroActa`, `labelDominio`, `pnlImporteTotal` y el panel de detalle con las líneas "Infracciones", "Lugar de la infracción", "Juzgado de radicación" y, cuando aplica, "Tipo de Pago Voluntario Con Descuento").
- Mantener el parseo separado de la automatización del navegador, para poder probarlo con HTML guardado sin tocar el sitio.

**Non-Goals:**
- Consultas por DNI u otro documento.
- Consultas en lote, cola de trabajos o reintentos automáticos sofisticados.
- Evadir, falsificar o resolver reCAPTCHA. La automatización se limita a ejecutar la página como lo haría un navegador.
- Persistencia de resultados o interfaz gráfica.

## Decisions

**1. Stack: Node.js con Playwright (`playwright` para Node).**
Se eligió Node porque toda la validación de la fase de exploración se hizo con Playwright para Node, y es lo que ya funciona en esta máquina. Alternativa considerada: Python con Playwright. Se descartó por ahora porque no está instalado en el entorno y no aporta ventajas para este alcance; si el proyecto luego se integra a un stack Python, el parseo es portable.

**2. Navegador administrado por Playwright, no ruta fija.**
La validación usó el Chromium de la caché local por ruta absoluta. El diseño usa el navegador que instala `npx playwright install chromium`, para que el proyecto sea reproducible en otra máquina. Alternativa: `channel: 'chrome'` con Chrome instalado. Se descartó por depender de software del sistema.

**3. Separación en tres capas.**
- `fetch`: abre el sitio, activa la pestaña, completa la patente, envía y espera el bloque de resultados. Es la única capa que habla con el sitio.
- `parse`: recibe el HTML (o el DOM serializado) de la página de resultados y devuelve el objeto de dominio. Sin dependencia de Playwright, para testearla con fixtures.
- `format`: convierte montos argentinos a número, suma los importes sin descuento y arma el JSON final.

Esto permite que los tests del parseo y del formato no toquen la red.

**4. Lectura del resultado por selectores de ASP.NET, con distinción explícita entre "sin actas" y "estructura no reconocida".**
Los selectores se basan en los ids generados por los repetidores (`rptResultados_ctl*`). La página de una patente sin actas no muestra encabezado de resultados ni actas, pero sí conserva el contenedor `#divGrilla` y el formulario de búsqueda (observado en el sitio). La regla es:
- Hay actas (`lblnroActa`) → se parsean.
- No hay actas, pero está `#divGrilla` → resultado vacío con el mensaje "Este auto no tiene multas registradas".
- Falta `#divGrilla` y el formulario → error de estructura no reconocida.

Riesgo aceptado: un cambio del sitio que mantenga `#divGrilla` se reportaría como "sin multas". Se mitiga con los fixtures de regresión y con la verificación de integración (tarea 7.1).

**5. Subtotal sobre importes sin descuento.**
Por cada acta: si existe "Importe Total sin Descuento" se usa ese valor; si no, se usa el importe del encabezado. El subtotal es la suma de estos valores. Es la decisión confirmada por el usuario.

**6. Datos de prueba sintéticos.**
Los fixtures de HTML se construyen a partir de la estructura observada, con patentes, números de acta, lugares e importes inventados. No se guardan páginas reales de consultas.

**7. Forma de entrega.**
Un comando de línea que recibe la patente como argumento y escribe el JSON en stdout. Alternativa: módulo importable. Se puede agregar después sin cambiar el parseo.

## Risks / Trade-offs

- **[Cambio en el HTML del sitio]** → Los selectores de ASP.NET pueden cambiar. Mitigación: fixtures de regresión y el error diferenciado de estructura no reconocida.
- **[reCAPTCHA v3 del lado del servidor]** → No se verificó si el servidor rechaza solicitudes sin token válido. Mitigación: el flujo usa un navegador real que ejecuta el script; el diseño no intenta falsificar tokens. Si el sitio bloquea la automatización, el cambio se detiene y se revisa la decisión con el usuario.
- **[Carga sobre el sitio público]** → Cada consulta abre un navegador. Mitigación: una patente por ejecución, sin paralelismo en esta iteración.
- **[Datos personales en salida y logs]** → Mitigación: requisito de tratamiento de datos personales; el logging registra solo estado y cantidad de actas, sin montos ni números de acta.
- **[Espera del resultado]** → No hay un evento explícito de "resultado listo" más allá del postback. Mitigación: esperar el bloque de resultados o un mensaje de error con timeout acotado.

## Migration Plan

No aplica: no hay sistema previo ni datos que migrar. El despliegue es instalar dependencias y ejecutar el comando. Rollback = borrar el código.

## Open Questions

Ninguna abierta. Resuelta: una patente sin actas, o que el sitio no encuentra, devuelve lista vacía, subtotal cero y el mensaje "Este auto no tiene multas registradas" (no es un error). Ver spec, escenario "Patente sin infracciones".
