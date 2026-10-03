import { BadRequestException, type HttpException } from '@nestjs/common';

/**
 * Error de una regla de dominio que el CLIENTE puede corregir (p. ej. vender más de lo que se
 * tiene). Lo lanza la lógica sin saber nada de HTTP, con un `code` estable y un mensaje legible
 * para el usuario; la traducción a respuesta se hace en un solo sitio, en el borde: el filtro
 * global para REST (`ErrorTranslationFilter`) y `ToolRunner` para MCP. Así quien lo captura
 * (p. ej. la importación) comprueba `instanceof` en vez de reinterpretar el cuerpo de un 400.
 *
 * Su mensaje llega al usuario tal cual: no debe llevar datos internos.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

/** Un error de dominio es una petición inválida: 400 con `{ code, message }`. */
export function domainErrorToHttp(error: DomainError): HttpException {
  return new BadRequestException({ code: error.code, message: error.message });
}
