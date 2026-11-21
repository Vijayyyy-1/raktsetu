import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { RegistryQueryDto, SetActiveDto } from './registry.dto';
import { RegistryService } from './registry.service';

@ApiTags('donor registry') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.COORDINATOR)
@Controller('donors')
export class RegistryController {
  constructor(private service: RegistryService) {}
  @Get() list(@Query() q: RegistryQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }
  @Patch(':id/active') setActive(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SetActiveDto) { return this.service.setActive(user, id, dto.active); }
}
