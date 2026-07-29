import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class ChangeOwnPasswordDto {
  @ApiProperty({ description: 'Mot de passe actuellement utilisé par le membre.' })
  @IsString()
  @Length(8, 128)
  currentPassword: string;

  @ApiProperty({ description: 'Nouveau mot de passe, différent de l’ancien.' })
  @IsString()
  @Length(12, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Le nouveau mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial.',
  })
  newPassword: string;
}
