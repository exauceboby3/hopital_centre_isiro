import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir exactement 6 chiffres.' })
  code: string;
}

export class DisableTwoFactorDto extends VerifyTwoFactorDto {
  @IsString()
  @Length(8, 128)
  password: string;
}
