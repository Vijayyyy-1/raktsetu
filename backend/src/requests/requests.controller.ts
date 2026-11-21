import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole, RequestStatus } from '@prisma/client';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { CreateRequestDto, MatchQueryDto, OutreachDto, UpdateRequestDto } from './requests.dto';
import { RequestsService } from './requests.service';

@ApiTags('blood requests') @Controller('blood-requests')
export class RequestsController {
  constructor(private service: RequestsService) {}
  @Get() list() { return this.service.listActive(); }
  @Get('closed') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  closed() { return this.service.listClosed(); }
  @Get('impact') impact() { return this.service.impact(); }
  @Get('communities') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  communities() { return this.service.communities(); }
  @Get('supply') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  supply() { return this.service.supply(); }
  @Get('responses/me') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.DONOR)
  myResponses(@CurrentUser() user: AuthUser) { return this.service.myResponses(user); }
  @Get(':id/status') status(@Param('id', ParseIntPipe) id: number) { return this.service.publicStatus(id); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.service.get(id); }
  @Post() @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) { return this.service.create(user, dto); }
  @Patch(':id') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRequestDto) { return this.service.update(id, dto); }
  @Post(':id/verify') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  verify(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.verify(id, user); }
  @Post(':id/matches') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  match(@Param('id', ParseIntPipe) id: number, @Query() query: MatchQueryDto) { return this.service.match(id, query.maxDistanceKm, query.community); }
  @Post(':id/matches/:donorId/contact') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
  contact(@Param('id', ParseIntPipe) id: number, @Param('donorId', ParseIntPipe) donorId: number, @CurrentUser() user: AuthUser) { return this.service.contact(id, donorId, user); }
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
