'use strict';

// Errores tipados para que el llamador distinga la causa sin parsear mensajes.

class ErrorValidacionPatente extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorValidacionPatente';
  }
}

class ErrorSitioNoDisponible extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorSitioNoDisponible';
  }
}

class ErrorEstructuraNoReconocida extends Error {
  constructor(mensaje) {
    super(mensaje || 'La página del sitio no tiene la estructura esperada; posible cambio del sitio.');
    this.name = 'ErrorEstructuraNoReconocida';
  }
}

// La consulta se canceló porque venció el tiempo total (señal `signal` disparada).
class ErrorTiempoAgotado extends Error {
  constructor(mensaje) {
    super(mensaje || 'Se venció el tiempo total de la consulta.');
    this.name = 'ErrorTiempoAgotado';
  }
}

// Variable de entorno inválida al arrancar el servidor.
class ErrorConfiguracion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorConfiguracion';
  }
}

module.exports = {
  ErrorValidacionPatente,
  ErrorSitioNoDisponible,
  ErrorEstructuraNoReconocida,
  ErrorTiempoAgotado,
  ErrorConfiguracion,
};
