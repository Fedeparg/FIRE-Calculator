import { z } from 'zod';

import { NOTIFICATION_LOCALES } from '@sextante/core/contracts';

export const updateNotificationSettingsSchema = z.strictObject({
  fireAlertsEnabled: z.boolean(),
  /** Idioma de los emails: el de la interfaz desde la que se activan. */
  locale: z.enum(NOTIFICATION_LOCALES),
});

export type UpdateNotificationSettingsDto = z.infer<typeof updateNotificationSettingsSchema>;
