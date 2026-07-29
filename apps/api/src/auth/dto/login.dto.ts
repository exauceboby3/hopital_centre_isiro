import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @Length(3, 100)
  username: string;

  @ApiProperty({ example: 'mot-de-passe-securise' })
  @IsString()
  @Length(8, 128)
  password: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code de vérification doit contenir 6 chiffres.' })
  otpCode?: string;
}
