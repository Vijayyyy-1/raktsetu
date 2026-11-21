import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Account, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { encrypt } from '../common/crypto';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  private token(account: Pick<Account, 'id' | 'email' | 'role'>) {
    return this.jwt.signAsync({ sub: String(account.id), email: account.email, role: account.role });
  }
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.account.findUnique({ where: { email } })) throw new ConflictException('Email is already registered');
    const account = await this.prisma.account.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: UserRole.DONOR,
        donor: { create: {
          displayName: dto.displayName.trim(), bloodGroup: dto.bloodGroup, phoneEncrypted: encrypt(dto.phone), area: dto.area.trim(),
          latitude: dto.latitude, longitude: dto.longitude, lastDonationAt: dto.lastDonationAt ? new Date(dto.lastDonationAt) : null,
          ...(dto.lastDonationAt ? { donations: { create: { donatedAt: new Date(dto.lastDonationAt) } } } : {}),
        } },
      },
      include: { donor: true },
    });
    return { accessToken: await this.token(account), tokenType: 'Bearer', expiresIn: '1h', user: { id: account.id, email: account.email, role: account.role } };
  }
  async login(dto: LoginDto) {
    const account = await this.prisma.account.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!account?.isActive || !(await bcrypt.compare(dto.password, account.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    return { accessToken: await this.token(account), tokenType: 'Bearer', expiresIn: '1h', user: { id: account.id, email: account.email, role: account.role } };
  }
  async me(id: number) {
    const account = await this.prisma.account.findUnique({ where: { id }, include: { donor: true } });
    if (!account?.isActive) throw new UnauthorizedException();
    return { id: account.id, email: account.email, role: account.role, donor: account.donor ? {
      id: account.donor.id, displayName: account.donor.displayName, bloodGroup: account.donor.bloodGroup, area: account.donor.area,
      latitude: account.donor.latitude, longitude: account.donor.longitude, available: account.donor.available, lastDonationAt: account.donor.lastDonationAt,
    } : null };
  }
}
