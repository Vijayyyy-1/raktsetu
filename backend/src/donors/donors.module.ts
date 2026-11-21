import { Module } from '@nestjs/common';
import { DonorsController } from './donors.controller';
import { DonorsService } from './donors.service';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { JwtAuthGuard, RolesGuard } from '../common/auth';
import { JwtModule } from '@nestjs/jwt';

@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET })], controllers: [DonorsController, RegistryController], providers: [DonorsService, RegistryService, JwtAuthGuard, RolesGuard] })
export class DonorsModule {}
