import { Module } from '@nestjs/common';
import { EnterpriseExportService } from '../enterprise/enterprise-export.service';

@Module({
  providers: [EnterpriseExportService],
  exports: [EnterpriseExportService],
})
export class ReportingModule {}
