import { IsString, Length } from 'class-validator';

/** Cuerpo de POST /api/auth/verify. */
export class VerifyDto {
  @IsString()
  @Length(10, 512)
  token!: string;
}
