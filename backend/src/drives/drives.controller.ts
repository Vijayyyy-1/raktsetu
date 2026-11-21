import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { CreateDriveDto, NearQueryDto } from './drives.dto';
import { DrivesService } from './drives.service';

@ApiTags('drives') @Controller('drives')
export class DrivesController {
  constructor(private service: DrivesService) {}
  @Get() list(@Query() q: NearQueryDto) { return this.service.listUpcoming(q.lat, q.lng); }
  @Post() @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDriveDto) { return this.service.create(user, dto); }
  @Get('rsvps/me') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  mine(@CurrentUser() user: AuthUser) { return this.service.myRsvps(user); }
  @Post(':id/rsvp') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  rsvp(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.service.rsvp(user, id); }
  @Delete(':id/rsvp') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.service.cancelRsvp(user, id); }
}
