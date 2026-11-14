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

module.exports = { ErrorValidacionPatente, ErrorSitioNoDisponible, ErrorEstructuraNoReconocida };
