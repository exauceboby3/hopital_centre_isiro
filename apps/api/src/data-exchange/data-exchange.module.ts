import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { DataExchangeController } from './data-exchange.controller';
import { DataExchangeService } from './data-exchange.service';
import { TabularCodecService } from './tabular-codec.service';

@Module({
  imports: [PatientsModule],
  controllers: [DataExchangeController],
  providers: [DataExchangeService, TabularCodecService],
})
export class DataExchangeModule {}
