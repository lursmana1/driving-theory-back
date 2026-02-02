import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  description?: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @IsNotEmpty()
  creatorId: number;
}
