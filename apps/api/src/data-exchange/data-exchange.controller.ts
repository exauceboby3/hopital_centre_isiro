import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DataExchangeQueryDto } from './dto/data-exchange.dto';
import { DataExchangeService } from './data-exchange.service';

interface UploadedTabularFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@ApiTags('data-exchange')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard)
@Controller('data-exchange')
export class DataExchangeController {
  constructor(private readonly exchange: DataExchangeService) {}

  @Get('catalog')
  catalog(@CurrentUser() user: AuthenticatedUser) {
    return this.exchange.catalog(user);
  }

  @Get('export/:dataset/:format')
  async export(
    @Param('dataset') dataset: string,
    @Param('format') format: string,
    @Query() query: DataExchangeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exchange.export(dataset, format, query, user);
    this.headers(response, file.fileName, file.mimeType);
    return new StreamableFile(file.buffer);
  }

  @Get('template/:dataset/:format')
  async template(
    @Param('dataset') dataset: string,
    @Param('format') format: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exchange.template(dataset, format, user);
    this.headers(response, file.fileName, file.mimeType);
    return new StreamableFile(file.buffer);
  }

  @Post('import/:dataset/preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  preview(
    @Param('dataset') dataset: string,
    @UploadedFile() file: UploadedTabularFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exchange.preview(dataset, this.requireFile(file), user);
  }

  @Post('import/:dataset/commit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  commit(
    @Param('dataset') dataset: string,
    @UploadedFile() file: UploadedTabularFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exchange.commit(dataset, this.requireFile(file), user);
  }

  private requireFile(file: UploadedTabularFile | undefined): UploadedTabularFile {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Sélectionnez un fichier CSV ou Excel à importer.');
    }
    return file;
  }

  private headers(response: Response, fileName: string, mimeType: string) {
    response.setHeader('Content-Type', mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
