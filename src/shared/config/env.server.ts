import "server-only";

import { PHASE_PRODUCTION_BUILD } from "next/constants";

/** API local de desarrollo (NestJS en el puerto por defecto). */
const DEV_API_URL = "http://localhost:3001";

/**
 * ¿Sirviendo en producción? `next build` también corre con `NODE_ENV=production`, pero en el
 * build no se llama a la API (las páginas que la usan son dinámicas) y no se debe exigir el
 * entorno de ejecución: CI construye sin él.
 */
function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD;
}

/**
 * URL interna de la API para las llamadas server-side (Next → NestJS, sin pasar por el proxy
 * público). En desarrollo cae a la API local; en producción, si falta o no es una URL, LANZA:
 * caer en silencio a `localhost` dejaría la web sin sesión ni cartera sin ningún aviso.
 * (`next.config.ts` lee la misma variable en el build para los `rewrites`.)
 */
export function serverApiUrl(): string {
  const raw = process.env.API_URL?.trim();
  if (!raw) {
    if (isProductionRuntime()) throw new Error("API_URL es obligatoria en producción (p. ej. http://api:3001)");
    return DEV_API_URL;
  }
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`API_URL no es una URL válida: "${raw}"`);
  }
}
