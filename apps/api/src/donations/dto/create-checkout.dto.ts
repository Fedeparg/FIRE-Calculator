import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { DONATION_MAX_EUR, DONATION_MIN_EUR } from '../donations.constants';

/** Cuerpo de POST /donations/checkout: importe de la donación en euros enteros. */
export class CreateCheckoutDto {
  @IsInt()
  @Min(DONATION_MIN_EUR)
  @Max(DONATION_MAX_EUR)
  amount!: number;

  /** Locale para construir la URL de retorno (página de gracias) en el idioma correcto. */
  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: 'es' | 'en';
}
