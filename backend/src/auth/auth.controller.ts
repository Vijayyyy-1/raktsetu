import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../common/auth';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}
  @Post('register') register(@Body() dto: RegisterDto) { return this.service.register(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.service.login(dto); }
  @Get('me') @ApiBearerAuth() @UseGuards(JwtAuthGuard) me(@CurrentUser() user: AuthUser) { return this.service.me(Number(user.sub)); }
}
