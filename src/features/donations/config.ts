// Interruptor público (build): "1" muestra el botón. La clave de Stripe vive solo en la API.
export const DONATIONS_ENABLED = process.env.NEXT_PUBLIC_DONATIONS_ENABLED === "1";

export const DONATION_PRESETS = [3, 5, 10] as const;

// Deben coincidir con la validación del backend.
export const DONATION_MIN_EUR = 1;
export const DONATION_MAX_EUR = 1000;
