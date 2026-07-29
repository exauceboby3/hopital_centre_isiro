import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferPatientDto {
  @ApiProperty()
  @IsUUID()
  bedId: string;
}
