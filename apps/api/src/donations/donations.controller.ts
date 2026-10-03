import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DonationsService } from './donations.service.js';
import { createCheckoutSchema, type CreateCheckoutDto } from './dto/create-checkout.dto.js';

@Controller('donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  /** Tells the frontend whether donations are available (Stripe configured). */
  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.donations.enabled };
  }

  /**
   * Creates a Checkout session and returns the Stripe-hosted URL. Public (donating needs no
   * account) and rate-limited to prevent session-creation abuse.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(@Body(new ZodValidationPipe(createCheckoutSchema)) dto: CreateCheckoutDto): Promise<{ url: string }> {
    const url = await this.donations.createCheckoutUrl(dto.amount, dto.locale ?? 'es');
    return { url };
  }
}
