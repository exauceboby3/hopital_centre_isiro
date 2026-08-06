import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class DirectReferralDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty()
  @IsUUID()
  billableServiceId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  service: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
