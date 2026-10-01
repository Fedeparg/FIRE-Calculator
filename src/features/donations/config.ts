/**
 * Donaciones ("invítame a un café"). El interruptor es PÚBLICO por diseño (no es un
 * secreto): se inlinea en build y gobierna si se RENDERIZA el botón. Cuando
 * vale "1" se muestra; vacío/0 lo oculta por completo. Ponlo a "1" en el `.env` de la
 * raíz a la vez que defines STRIPE_SECRET_KEY en `apps/api/.env` (ver .env.example).
 *
 * La clave secreta de Stripe NUNCA toca el frontend: el flujo redirige a la URL alojada
 * de Stripe que devuelve la API, así que aquí no hace falta publishable key ni Stripe.js.
 */
export const DONATIONS_ENABLED = process.env.NEXT_PUBLIC_DONATIONS_ENABLED === "1";

/** Importes sugeridos (en euros). El usuario también puede teclear otra cantidad. */
export const DONATION_PRESETS = [3, 5, 10] as const;

/** Límites aceptados (deben coincidir con la validación del backend). */
export const DONATION_MIN_EUR = 1;
export const DONATION_MAX_EUR = 1000;
