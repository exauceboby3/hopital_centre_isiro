import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/authenticated-user';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { ProfilePhotoService, ProfilePhotoUpload } from './profile-photo.service';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly photos: ProfilePhotoService,
  ) {}

  @Get()
  list(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.users.listActive(currentUser);
  }

  @Get('me/profile')
  ownProfile(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.users.findOwnProfile(currentUser.id);
  }

  @Patch('me/profile')
  updateOwnProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.users.updateOwnProfile(currentUser.id, dto);
  }

  @Post('me/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  uploadOwnPhoto(
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFile() file: ProfilePhotoUpload | undefined,
  ) {
    if (!file) throw new BadRequestException('Sélectionnez une photo de profil.');
    return this.photos.save(currentUser.id, file);
  }

  @Get(':id/photo')
  async profilePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const photo = await this.photos.read(id);
    response.set({
      'Content-Type': photo.mimeType,
      'Content-Length': String(photo.sizeBytes),
      'Cache-Control': 'private, max-age=3600',
      'Last-Modified': photo.updatedAt.toUTCString(),
    });
    return new StreamableFile(photo.data);
  }

  @Patch('me/password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changeOwnPassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: ChangeOwnPasswordDto,
  ) {
    return this.users.changeOwnPassword(currentUser.id, dto);
  }
}
