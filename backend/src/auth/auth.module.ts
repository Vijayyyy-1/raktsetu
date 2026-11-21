import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, RolesGuard } from '../common/auth';
import { JwtModule } from '@nestjs/jwt';

@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } })], controllers: [AuthController], providers: [AuthService, JwtAuthGuard, RolesGuard], exports: [JwtAuthGuard, RolesGuard] })
export class AuthModule {}
