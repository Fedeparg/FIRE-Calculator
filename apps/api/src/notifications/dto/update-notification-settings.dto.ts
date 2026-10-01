import { IsBoolean, IsIn } from 'class-validator';

import { NOTIFICATION_LOCALES, type NotificationLocale } from '@sextante/core/contracts';

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  fireAlertsEnabled!: boolean;

  /** Idioma de los emails: el de la interfaz desde la que se activan. */
  @IsIn(NOTIFICATION_LOCALES)
  locale!: NotificationLocale;
}
