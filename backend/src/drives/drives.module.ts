import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, RolesGuard } from '../common/auth';
import { DrivesController } from './drives.controller';
import { DrivesService } from './drives.service';

@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET })], controllers: [DrivesController], providers: [DrivesService, JwtAuthGuard, RolesGuard] })
export class DrivesModule {}
