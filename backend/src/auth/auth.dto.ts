import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { BloodGroup } from '@prisma/client';

export class RegisterDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ minLength: 10 }) @IsString() @MinLength(10) password: string;
  @ApiProperty() @IsString() @MinLength(2) displayName: string;
  @ApiProperty({ enum: BloodGroup }) @IsEnum(BloodGroup) bloodGroup: BloodGroup;
  @ApiProperty() @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/) phone: string;
  @ApiProperty() @IsString() area: string;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() lastDonationAt?: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
}
