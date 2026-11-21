import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../common/validation';

export class CreateDonationDto {
  @ApiProperty() @IsDateString() donatedAt: string;
}

export class UpdateDonorDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(60) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(80) area?: string;
  @ApiPropertyOptional({ description: 'College, workplace or housing society; empty string clears it' }) @IsOptional() @Trim() @IsString() @MaxLength(60) community?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() available?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/) phone?: string;
  // lastDonationAt is not editable here: it is derived from the donation history (POST/DELETE /donors/me/donations).
}
