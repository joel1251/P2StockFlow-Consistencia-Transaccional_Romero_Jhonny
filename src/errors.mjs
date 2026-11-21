// Excepción de aplicación: contrato estable para comunicar fallos al cliente.
export class AppError extends Error {
  constructor(statusCode, code, message, {transaction=null, cause}={}) {
    super(message, {cause});
    this.name='AppError';
    this.statusCode=statusCode;
    this.code=code;
    this.transaction=transaction;
  }
}

export function errorResponse(error, requestId, circuit) {
  const known=error instanceof AppError;
  const status=known?error.statusCode:500;
  const message=known?error.message:'Error interno del servidor';
  return {
    status,
    code:known?error.code:'INTERNAL_ERROR',
    message,
    requestId,
    error:message, // Compatibilidad con el cliente web existente.
    transaction:known?error.transaction:null,
    circuit
  };
}
