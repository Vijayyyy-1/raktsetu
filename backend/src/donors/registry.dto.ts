import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BloodGroup } from '@prisma/client';

export const REGISTRY_STATUSES = ['eligible', 'soon', 'resting', 'paused', 'inactive'] as const;
export type RegistryStatus = (typeof REGISTRY_STATUSES)[number];

export class RegistryQueryDto {
  @ApiPropertyOptional({ description: 'Name, area or community contains' }) @IsOptional() @IsString() @MaxLength(60) q?: string;
  @ApiPropertyOptional({ enum: BloodGroup }) @IsOptional() @IsEnum(BloodGroup) group?: BloodGroup;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) community?: string;
  @ApiPropertyOptional({ enum: REGISTRY_STATUSES }) @IsOptional() @IsIn(REGISTRY_STATUSES) status?: RegistryStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 25 }) @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(100) pageSize?: number;
}

export class SetActiveDto {
  @ApiProperty() @IsBoolean() active: boolean;
}
