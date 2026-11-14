# Spec Delta

## Purpose

Permite consultar las infracciones de tránsito asociadas a una patente (dominio) en el sitio público de la ANSV y obtener un resultado estructurado con el detalle de cada acta y el subtotal adeudado por el vehículo.

## ADDED Requirements

### Requirement: Consulta por patente
El sistema SHALL aceptar una patente (dominio) como única entrada de consulta y SHALL consultar las infracciones asociadas a ella en el sitio de la ANSV. El sistema MUST NOT requerir ni aceptar DNI u otro documento para esta consulta.

#### Scenario: Patente válida con infracciones
- **WHEN** se solicita la consulta para una patente que tiene actas registradas
- **THEN** el sistema devuelve un resultado que contiene el dominio consultado y la lista de actas asociadas

#### Scenario: Patente sin infracciones
- **WHEN** se solicita la consulta para una patente que no tiene actas registradas, o que el sitio no encuentra
- **THEN** el sistema devuelve un resultado con el dominio consultado, una lista de infracciones vacía, un subtotal de cero y el campo `mensaje` con el texto "Este auto no tiene multas registradas", sin tratarlo como error

#### Scenario: Entrada de patente vacía o malformada
- **WHEN** se solicita la consulta con una patente vacía o con más de 7 caracteres
- **THEN** el sistema rechaza la solicitud sin consultar el sitio y devuelve un error de validación

### Requirement: Estructura del resultado por acta
El resultado SHALL incluir, por cada acta, el número de acta, el dominio, el importe, el tipo de infracción en texto completo, el lugar de la infracción y el juzgado de radicación. Cuando el sitio informe un importe sin descuento, el resultado SHALL incluirlo como campo separado.

#### Scenario: Acta con tipo de infracción completo
- **WHEN** el sitio muestra un acta con norma, artículo y descripción de la infracción
- **THEN** el campo de tipo de infracción contiene el texto completo tal como lo muestra el sitio, incluyendo norma, artículo y descripción

#### Scenario: Acta con pago voluntario con descuento
- **WHEN** el sitio muestra un acta con la línea "Tipo de Pago Voluntario Con Descuento" e "Importe Total sin Descuento"
- **THEN** el resultado incluye el importe sin descuento de esa acta en un campo separado del importe mostrado en el encabezado

#### Scenario: Acta sin línea de descuento
- **WHEN** el sitio muestra un acta sin línea de pago con descuento
- **THEN** el resultado no incluye importe sin descuento para esa acta

### Requirement: Subtotal sin descuento
El resultado SHALL incluir un campo `subtotal` que equivale a la suma de los importes sin descuento de todas las actas de la patente. Cuando un acta no informe importe sin descuento, su importe del encabezado SHALL usarse para la suma.

#### Scenario: Suma con actas con y sin descuento
- **WHEN** una patente tiene tres actas, una de ellas con importe sin descuento informado
- **THEN** el subtotal es la suma de los importes sin descuento de las tres actas

#### Scenario: Subtotal sin actas
- **WHEN** la patente no tiene actas
- **THEN** el subtotal es cero

### Requirement: Formato de montos
El sistema SHALL convertir los montos mostrados en formato argentino (punto como separador de miles y coma como separador decimal) a valores numéricos en el resultado.

#### Scenario: Monto con miles y decimales
- **WHEN** el sitio muestra un importe de "$ 39.000,00"
- **THEN** el resultado contiene el valor numérico 39000.00

### Requirement: Salida en JSON
El resultado SHALL entregarse como documento JSON con los campos `dominio`, `infracciones` y `subtotal`.

#### Scenario: Estructura del JSON de salida
- **WHEN** la consulta finaliza correctamente
- **THEN** el documento JSON contiene `dominio` (texto), `infracciones` (lista de actas con sus campos) y `subtotal` (número)

### Requirement: Manejo de errores del sitio
El sistema SHALL distinguir entre falla del sitio, respuesta sin resultados interpretables y cambio de estructura, y SHALL informarlos como errores diferenciados en lugar de devolver un resultado parcial o vacío sin aviso.

#### Scenario: Sitio no disponible
- **WHEN** el sitio no responde o devuelve un error del servidor
- **THEN** el sistema devuelve un error que indica falla del sitio, sin devolver un resultado con subtotal

#### Scenario: Estructura del sitio no reconocida
- **WHEN** la página devuelta no contiene el contenedor de resultados (`#divGrilla`) ni el formulario de búsqueda por dominio
- **THEN** el sistema devuelve un error que indica cambio o formato no reconocido, sin devolver un subtotal

#### Scenario: Contenedor presente sin actas
- **WHEN** la página devuelta contiene el contenedor de resultados pero no contiene el encabezado "Resultado de la consulta" ni actas
- **THEN** el sistema lo trata como patente sin infracciones (lista vacía, subtotal cero y el mensaje "Este auto no tiene multas registradas"), no como error

### Requirement: Tratamiento de datos personales
El sistema MUST tratar los datos de infracciones como datos personales. Los registros de ejecución, los mensajes de error y los datos de prueba SHALL NOT contener números de acta, patentes reales, importes ni nombres de lugares o juzgados en claro.

#### Scenario: Log de consulta exitosa
- **WHEN** una consulta finaliza correctamente
- **THEN** el registro de ejecución no contiene el dominio, los números de acta ni los importes en claro

#### Scenario: Datos de prueba
- **WHEN** se incorporan fixtures para pruebas automatizadas
- **THEN** los fixtures usan datos anonimizados o sintéticos, no datos reales de patentes
