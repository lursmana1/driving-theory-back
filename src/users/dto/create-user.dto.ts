import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @Transform(({ value }) => parseInt(value)) 
  @IsNumber()
  @IsOptional()
  age?: number;
}
