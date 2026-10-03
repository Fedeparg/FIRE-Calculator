import { z } from 'zod';

import { NOTIFICATION_LOCALES } from '@sextante/core/contracts';

export const updateNotificationSettingsSchema = z.strictObject({
  fireAlertsEnabled: z.boolean(),
  /** Email language: that of the UI the alerts were enabled from. */
  locale: z.enum(NOTIFICATION_LOCALES),
});

export type UpdateNotificationSettingsDto = z.infer<typeof updateNotificationSettingsSchema>;
