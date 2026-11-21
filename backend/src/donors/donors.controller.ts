import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { UserRole } from '@prisma/client';
import { DonorsService } from './donors.service';
import { CreateDonationDto, UpdateDonorDto } from './donors.dto';

@ApiTags('donors') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
@Controller('donors/me')
export class DonorsController {
  constructor(private service: DonorsService) {}
  @Get() getMine(@CurrentUser() user: AuthUser) { return this.service.getMine(user); }
  @Patch() update(@CurrentUser() user: AuthUser, @Body() dto: UpdateDonorDto) { return this.service.update(user, dto); }
  @Get('donations') donations(@CurrentUser() user: AuthUser) { return this.service.donations(user); }
  @Post('donations') addDonation(@CurrentUser() user: AuthUser, @Body() dto: CreateDonationDto) { return this.service.addDonation(user, dto); }
  @Delete('donations/:id') removeDonation(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.service.removeDonation(user, id); }
  @Get('eligibility') eligibility(@CurrentUser() user: AuthUser) { return this.service.eligibility(user); }
}
