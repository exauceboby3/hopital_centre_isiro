import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProfilePhotoUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const formats = [
  { extension: '.jpg', mimeType: 'image/jpeg' },
  { extension: '.png', mimeType: 'image/png' },
  { extension: '.webp', mimeType: 'image/webp' },
] as const;

@Injectable()
export class ProfilePhotoService {
  private readonly directory = process.env.PROFILE_UPLOAD_DIR?.trim() || '/app/uploads/profiles';

  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, file: ProfilePhotoUpload) {
    await this.ensureUser(userId);
    const format = formats.find((entry) => entry.mimeType === file.mimetype);
    if (!format || !this.matchesSignature(file.buffer, format.mimeType)) {
      throw new BadRequestException('La photo doit être un fichier JPEG, PNG ou WebP valide.');
    }
    if (!file.size || file.size > 3 * 1024 * 1024) {
      throw new BadRequestException('La photo de profil ne doit pas dépasser 3 Mo.');
    }

    await mkdir(this.directory, { recursive: true });
    await Promise.all(
      formats.map((entry) =>
        entry.extension === format.extension
          ? Promise.resolve()
          : rm(join(this.directory, `${userId}${entry.extension}`), { force: true }),
      ),
    );
    const path = join(this.directory, `${userId}${format.extension}`);
    await writeFile(path, file.buffer, { mode: 0o600 });
    const metadata = await stat(path);
    return {
      success: true,
      mimeType: format.mimeType,
      sizeBytes: metadata.size,
      updatedAt: metadata.mtime,
    };
  }

  async read(userId: string) {
    await this.ensureUser(userId);
    for (const format of formats) {
      const path = join(this.directory, `${userId}${format.extension}`);
      try {
        const [data, metadata] = await Promise.all([readFile(path), stat(path)]);
        return {
          data,
          mimeType: format.mimeType,
          sizeBytes: metadata.size,
          updatedAt: metadata.mtime,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new NotFoundException('Photo de profil introuvable.');
  }

  private async ensureUser(userId: string) {
    const exists = await this.prisma.user.count({ where: { id: userId, isActive: true } });
    if (!exists) throw new NotFoundException('Utilisateur introuvable.');
  }

  private matchesSignature(buffer: Buffer, mimeType: string) {
    if (mimeType === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
    if (mimeType === 'image/png') {
      return (
        buffer.length > 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }
    return (
      mimeType === 'image/webp' &&
      buffer.length > 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
}
