/**
 * Error PENSADO para el usuario de una tool MCP: su mensaje se reenvía tal cual al host (y de
 * ahí al LLM). Cualquier otro error se considera interno y el host solo recibe una referencia
 * (ver `ToolRunner`), así que el texto de estos errores nunca debe llevar datos internos.
 */
export class ToolUserError extends Error {}

/** Error de validación de entrada de tool (se muestra con el prefijo "Entrada no válida"). */
export class InvalidToolInputError extends ToolUserError {}
