/** Token de inyección del cliente de Stripe (o `null` si no está configurado). */
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/** Importe mínimo y máximo aceptado en una donación (en euros enteros). */
export const DONATION_MIN_EUR = 1;
export const DONATION_MAX_EUR = 1000;
