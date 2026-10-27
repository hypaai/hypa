import {
  IsOptional,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password!: string;
}

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  first_name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  last_name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  refCode?: string;

  @IsOptional()
  @IsString()
  app?: string;
}

export class GoogleAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  picture?: string;

  @IsOptional()
  @IsString()
  refCode?: string;

  @IsOptional()
  @IsString()
  app?: string;
}

export class AppleAuthDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  refCode?: string;

  @IsOptional()
  @IsString()
  app?: string;
}
