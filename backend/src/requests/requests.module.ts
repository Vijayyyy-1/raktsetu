import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, RolesGuard } from '../common/auth';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET })], controllers: [RequestsController], providers: [RequestsService, JwtAuthGuard, RolesGuard] })
export class RequestsModule {}
