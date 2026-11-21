import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BloodGroup, OutreachStatus, RequestUrgency } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty({ enum: BloodGroup }) @IsEnum(BloodGroup) bloodGroup: BloodGroup;
  @ApiProperty({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @Max(10) units: number;
  @ApiProperty() @IsString() @MinLength(2) hospitalName: string;
  @ApiProperty() @IsString() area: string;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude: number;
  @ApiProperty({ enum: RequestUrgency }) @IsEnum(RequestUrgency) urgency: RequestUrgency;
  @ApiProperty() @IsDateString() expiresAt: string;
}

export class MatchQueryDto {
  @ApiProperty({ required: false, default: 50 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) maxDistanceKm?: number;
  @ApiProperty({ required: false, description: 'Only donors from this college / community' }) @IsOptional() @IsString() community?: string;
}

export class OutreachDto {
  @ApiProperty({ enum: OutreachStatus }) @IsEnum(OutreachStatus) status: OutreachStatus;
}

export class UpdateRequestDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 10 }) @IsOptional() @IsInt() @Min(1) @Max(10) units?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 10 }) @IsOptional() @IsInt() @Min(0) @Max(10) unitsReceived?: number;
  @ApiPropertyOptional({ enum: RequestUrgency }) @IsOptional() @IsEnum(RequestUrgency) urgency?: RequestUrgency;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}
