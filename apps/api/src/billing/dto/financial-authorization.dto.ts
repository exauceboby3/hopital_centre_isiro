import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BillableServiceType, CareAuthorizationStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBillableServiceDto {
  @ApiProperty({ example: 'CONS-GEN' })
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'Consultation générale' })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: BillableServiceType })
  @IsEnum(BillableServiceType)
  type: BillableServiceType;

  @ApiPropertyOptional({ example: 'Hématologie' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiProperty({ minimum: 0, example: 10000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresPrepayment?: boolean;
}

export class UpdateBillableServiceDto extends PartialType(CreateBillableServiceDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCareAuthorizationDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  serviceId: string;
}

export class CreatePharmacyAuthorizationDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  medicationId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class WaiveAuthorizationDto {
  @ApiProperty({ example: 'Urgence vitale confirmée par le médecin de garde.' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}

export class ListCareAuthorizationsDto {
  @ApiPropertyOptional({ enum: BillableServiceType })
  @IsOptional()
  @IsEnum(BillableServiceType)
  type?: BillableServiceType;

  @ApiPropertyOptional({ enum: CareAuthorizationStatus })
  @IsOptional()
  @IsEnum(CareAuthorizationStatus)
  status?: CareAuthorizationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;
}
