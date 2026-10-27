import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateBookmarkDto {
  @IsString()
  @IsNotEmpty()
  word: string;

  @IsString()
  @IsNotEmpty()
  language: string;

  @IsObject()
  @IsNotEmpty()
  result: Record<string, unknown>;
}

export class DeleteBookmarkDto {
  @IsString()
  @IsNotEmpty()
  word: string;

  @IsString()
  @IsNotEmpty()
  language: string;
}
