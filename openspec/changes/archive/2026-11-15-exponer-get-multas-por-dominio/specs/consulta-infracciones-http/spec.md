# Spec Delta

## Purpose

Permite consultar las infracciones de una patente mediante una petición HTTP GET a un servidor local, recibiendo el mismo JSON que produce la consulta por patente, con validación de entrada, timeout total por request y errores diferenciados por código HTTP.

## ADDED Requirements

### Requirement: Endpoint GET por patente
El sistema SHALL exponer un endpoint HTTP `GET /getMultasPorDominio` que recibe la patente en el parámetro de query `dominio` y SHALL ejecutar la consulta por patente. El sistema MUST NOT requerir ni aceptar DNI u otro documento.

#### Scenario: Consulta exitosa
- **WHEN** se recibe `GET /getMultasPorDominio?dominio=AAA111` y la consulta finaliza correctamente
- **THEN** el sistema responde 200 con un cuerpo JSON que contiene `dominio`, `infracciones` y `subtotal`, y `mensaje` cuando la patente no tiene multas

#### Scenario: Ruta o método no soportados
- **WHEN** se recibe una petición a otra ruta o con un método distinto de GET
- **THEN** el sistema responde 404 o 405 sin consultar el sitio

### Requirement: Validación del parámetro dominio
El sistema SHALL validar el parámetro `dominio` con las mismas reglas de la consulta por patente y SHALL rechazar la petición sin consultar el sitio cuando el parámetro falte, esté vacío o tenga más de 7 caracteres.

#### Scenario: Parámetro dominio ausente
- **WHEN** se recibe `GET /getMultasPorDominio` sin el parámetro `dominio`
- **THEN** el sistema responde 400 con un mensaje de error de validación y no abre el navegador

#### Scenario: Parámetro dominio demasiado largo
- **WHEN** se recibe `GET /getMultasPorDominio?dominio=ABCDEFGH` con 8 caracteres
- **THEN** el sistema responde 400 con un mensaje de error de validación y no abre el navegador

### Requirement: Timeout total por request
El sistema SHALL limitar el tiempo total de cada consulta a 10 segundos por defecto. El valor SHALL poder configurarse mediante una variable de entorno. Al vencerse el límite, el sistema SHALL cerrar el navegador y responder 504 indicando que se venció el tiempo total de la consulta.

#### Scenario: Consulta dentro del límite
- **WHEN** la consulta finaliza antes del límite de tiempo total
- **THEN** el sistema responde con el resultado sin error de timeout

#### Scenario: Consulta que supera el límite
- **WHEN** la consulta no finaliza antes del límite de tiempo total
- **THEN** el sistema cierra el navegador y responde 504 con un mensaje que indica vencimiento del tiempo total

#### Scenario: Valor configurado por variable de entorno
- **WHEN** la variable de entorno del timeout tiene un valor en segundos válido
- **THEN** el sistema usa ese valor como límite de tiempo total

### Requirement: Mapeo de errores a códigos HTTP
El sistema SHALL responder cada tipo de error con un código HTTP diferenciado y SHALL NOT devolver un subtotal cuando la consulta falla.

#### Scenario: Falla del sitio
- **WHEN** el sitio no responde o devuelve un error del servidor
- **THEN** el sistema responde 502 con un mensaje que indica falla del sitio, sin subtotal

#### Scenario: Estructura del sitio no reconocida
- **WHEN** la página devuelta por el sitio no tiene la estructura esperada
- **THEN** el sistema responde 422 con un mensaje que indica cambio o formato no reconocido, sin subtotal

#### Scenario: Patente sin infracciones
- **WHEN** la patente no tiene actas registradas
- **THEN** el sistema responde 200 con lista de infracciones vacía, subtotal cero y el campo `mensaje` con el texto "Este auto no tiene multas registradas", sin tratarlo como error

### Requirement: Atención secuencial de consultas
El sistema SHALL atender una consulta a la vez. Las peticiones que lleguen mientras otra consulta está en curso SHALL esperar su turno.

#### Scenario: Dos peticiones simultáneas
- **WHEN** llegan dos peticiones de consulta al mismo tiempo
- **THEN** el sistema procesa una después de la otra y responde a ambas

### Requirement: Escucha local por defecto
El servidor SHALL escuchar en la dirección 127.0.0.1 por defecto y SHALL permitir configurar el puerto mediante una variable de entorno. El servidor MUST NOT escuchar en todas las interfaces de red sin una configuración explícita.

#### Scenario: Arranque con configuración por defecto
- **WHEN** el servidor arranca sin variables de entorno de red
- **THEN** solo acepta conexiones desde 127.0.0.1

#### Scenario: Puerto configurado
- **WHEN** la variable de entorno del puerto tiene un valor válido
- **THEN** el servidor escucha en ese puerto

### Requirement: Tratamiento de datos personales en logs
El servidor MUST NOT registrar en sus logs la patente, los números de acta ni los importes. Los logs SHALL limitarse al estado de la consulta, la cantidad de actas y el tipo de error.

#### Scenario: Log de consulta exitosa
- **WHEN** una consulta finaliza correctamente
- **THEN** el log contiene el estado y la cantidad de actas, y no contiene la patente, números de acta ni importes

#### Scenario: Log de consulta fallida
- **WHEN** una consulta falla
- **THEN** el log contiene el tipo de error y no contiene la patente
