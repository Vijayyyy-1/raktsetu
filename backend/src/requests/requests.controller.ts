import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole, RequestStatus } from '@prisma/client';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { CreateRequestDto, MatchQueryDto, OutreachDto } from './requests.dto';
import { RequestsService } from './requests.service';

@ApiTags('blood requests') @Controller('blood-requests')
export class RequestsController {
  constructor(private service: RequestsService) {}
  @Get() list() { return this.service.listActive(); }
  @Get('responses/me') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  myResponses(@CurrentUser() user: AuthUser) { return this.service.myResponses(user); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.service.get(id); }
  @Post() @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) { return this.service.create(user, dto); }
  @Post(':id/verify') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  verify(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.verify(id, user); }
  @Post(':id/matches') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  match(@Param('id', ParseIntPipe) id: number, @Query() query: MatchQueryDto) { return this.service.match(id, query.maxDistanceKm); }
  @Post(':id/respond') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  respond(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.respond(id, user); }
  @Delete(':id/respond') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  withdraw(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.withdraw(id, user); }
  @Get(':id/outreach') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  outreach(@Param('id', ParseIntPipe) id: number) { return this.service.outreach(id); }
  @Put(':id/outreach/:donorId') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  setOutreach(@Param('id', ParseIntPipe) id: number, @Param('donorId', ParseIntPipe) donorId: number, @Body() dto: OutreachDto) { return this.service.setOutreach(id, donorId, dto); }
  @Post(':id/fulfill') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  fulfill(@Param('id', ParseIntPipe) id: number) { return this.service.close(id, RequestStatus.FULFILLED); }
  @Post(':id/cancel') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  cancel(@Param('id', ParseIntPipe) id: number) { return this.service.close(id, RequestStatus.CANCELLED); }
}
