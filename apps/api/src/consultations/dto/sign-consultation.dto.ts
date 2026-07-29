import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignConsultationDto {
  @ApiPropertyOptional({ description: 'Confirmation ou observation finale avant signature.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  confirmation?: string;
}
