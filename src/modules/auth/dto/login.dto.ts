import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@bancodemo.test' })
  @IsEmail()
  @MaxLength(120)
  email: string;

  @ApiProperty({ example: 'change-me-please' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
