import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { UserRole } from '@prisma/client';
import { DonorsService } from './donors.service';
import { UpdateDonorDto } from './donors.dto';

@ApiTags('donors') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
@Controller('donors/me')
export class DonorsController {
  constructor(private service: DonorsService) {}
  @Get() getMine(@CurrentUser() user: AuthUser) { return this.service.getMine(user); }
  @Patch() update(@CurrentUser() user: AuthUser, @Body() dto: UpdateDonorDto) { return this.service.update(user, dto); }
  @Get('eligibility') eligibility(@CurrentUser() user: AuthUser) { return this.service.eligibility(user); }
}
