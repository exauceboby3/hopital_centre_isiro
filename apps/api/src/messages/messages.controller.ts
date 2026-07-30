import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.conversations(user.id);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.unread(user.id);
  }

  @Get('conversation/:userId')
  conversation(
    @Param('userId', ParseUUIDPipe) otherId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messages.conversation(user.id, otherId);
  }

  @Post()
  send(@Body() dto: SendMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messages.send(user.id, dto);
  }

  @Post('attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  sendAttachment(
    @Body() dto: SendMessageDto,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Sélectionnez un document ou une image.');
    return this.messages.sendAttachment(user.id, dto, file);
  }

  @Delete(':id')
  deleteForUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messages.deleteForUser(id, user.id);
  }

  @Get('attachments/:id')
  async attachment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const attachment = await this.messages.attachment(id, user.id);
    response.set({
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.sizeBytes),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(Buffer.from(attachment.data));
  }
}
