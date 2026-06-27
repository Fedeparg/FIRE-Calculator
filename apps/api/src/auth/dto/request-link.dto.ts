import { IsEmail, MaxLength } from 'class-validator';

/** Cuerpo de POST /api/auth/request. */
export class RequestLinkDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254)
  email!: string;
}
