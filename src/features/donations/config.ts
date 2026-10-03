// Public build-time switch: "1" shows the button. The Stripe key lives only in the API.
export const DONATIONS_ENABLED = process.env.NEXT_PUBLIC_DONATIONS_ENABLED === "1";

export const DONATION_PRESETS = [3, 5, 10] as const;

// Must match the backend validation.
export const DONATION_MIN_EUR = 1;
export const DONATION_MAX_EUR = 1000;
