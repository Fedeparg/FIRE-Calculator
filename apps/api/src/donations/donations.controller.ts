import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DonationsService } from './donations.service.js';
import { createCheckoutSchema, type CreateCheckoutDto } from './dto/create-checkout.dto.js';

@Controller('donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  /** Indica al frontend si las donaciones están disponibles (Stripe configurado). */
  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.donations.enabled };
  }

  /**
   * Crea una sesión de Checkout y devuelve la URL alojada de Stripe. Público (donar no
   * exige cuenta) y limitado para evitar abuso de creación de sesiones.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(@Body(new ZodValidationPipe(createCheckoutSchema)) dto: CreateCheckoutDto): Promise<{ url: string }> {
    const url = await this.donations.createCheckoutUrl(dto.amount, dto.locale ?? 'es');
    return { url };
  }
}
