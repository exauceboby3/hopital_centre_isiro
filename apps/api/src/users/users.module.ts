import { Module } from '@nestjs/common';
import { ProfilePhotoService } from './profile-photo.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, ProfilePhotoService],
  exports: [UsersService],
})
export class UsersModule {}
