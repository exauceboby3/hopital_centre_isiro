import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigurationService } from './configuration/configuration.service';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get()
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('branding')
  @Header('Cache-Control', 'no-store')
  async branding() {
    const profile = await this.configuration.hospitalProfile();
    return {
      name: profile.name,
      legalName: profile.legalName,
      logoDataUrl: profile.logoDataUrl,
      documentAccentColor: profile.documentAccentColor,
      updatedAt: profile.updatedAt,
    };
  }
}
