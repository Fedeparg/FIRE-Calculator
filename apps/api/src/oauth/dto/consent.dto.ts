import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';

import { SCOPES_SUPPORTED } from '../oauth.constants.js';

/** Cuerpo de la aprobación de consentimiento: a qué cliente y con qué scopes. */
export class ConsentDto {
  @IsString()
  clientId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SCOPES_SUPPORTED, { each: true })
  scopes!: string[];
}
