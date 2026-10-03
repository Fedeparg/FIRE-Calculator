import { describe, expect, it, vi } from 'vitest';

import { fakeConfig } from '../../test/config.js';
import type { NotificationSettingsService } from './notification-settings.service.js';
import { UnsubscribeController } from './notifications.controller.js';
import { createUnsubscribeToken } from './unsubscribe-token.js';
import { stub } from '../../test/factories.js';

const SECRET = 'test-secret';
const USER = '0b6f2c1e-8a4d-4c3b-9e2f-1a2b3c4d5e6f';

function setup() {
  const settings = { unsubscribe: vi.fn(() => Promise.resolve()) };
  const config = fakeConfig({ JWT_SECRET: SECRET });
  return {
    controller: new UnsubscribeController(stub<NotificationSettingsService>(settings), config),
    settings,
  };
}

describe('UnsubscribeController', () => {
  it('unsubscribes the user when the token is valid', async () => {
    const { controller, settings } = setup();
    await controller.unsubscribe(createUnsubscribeToken(USER, SECRET));
    expect(settings.unsubscribe).toHaveBeenCalledWith(USER);
  });

  it('does nothing with an invalid or missing token (and does not throw: always 204)', async () => {
    const { controller, settings } = setup();
    await controller.unsubscribe(createUnsubscribeToken(USER, 'other'));
    await controller.unsubscribe(undefined);
    await controller.unsubscribe('garbage');
    expect(settings.unsubscribe).not.toHaveBeenCalled();
  });
});
