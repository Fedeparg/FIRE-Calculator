import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { NotificationSettingsService } from './notification-settings.service.js';
import { UnsubscribeController } from './notifications.controller.js';
import { createUnsubscribeToken } from './unsubscribe-token.js';

const SECRET = 'test-secret';
const USER = '0b6f2c1e-8a4d-4c3b-9e2f-1a2b3c4d5e6f';

function setup() {
  const settings = { unsubscribe: vi.fn(() => Promise.resolve()) };
  const config = { getOrThrow: () => SECRET } as unknown as ConfigService;
  return {
    controller: new UnsubscribeController(settings as unknown as NotificationSettingsService, config),
    settings,
  };
}

describe('UnsubscribeController', () => {
  it('con un token válido da de baja a ese usuario', async () => {
    const { controller, settings } = setup();
    await controller.unsubscribe(createUnsubscribeToken(USER, SECRET));
    expect(settings.unsubscribe).toHaveBeenCalledWith(USER);
  });

  it('con un token inválido o ausente no hace nada (y no lanza: siempre 204)', async () => {
    const { controller, settings } = setup();
    await controller.unsubscribe(createUnsubscribeToken(USER, 'otro'));
    await controller.unsubscribe(undefined);
    await controller.unsubscribe('basura');
    expect(settings.unsubscribe).not.toHaveBeenCalled();
  });
});
