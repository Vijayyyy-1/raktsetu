import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Account, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { encrypt } from '../common/crypto';
import { LoginDto, RegisterDto } from './auth.dto';

// "  coep  pune " and "COEP Pune" should land in the same community.
export const tidyCommunity = (c?: string) => c?.trim().replace(/\s+/g, ' ') || null;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  private token(account: Pick<Account, 'id' | 'email' | 'role'>) {
    return this.jwt.signAsync({ sub: String(account.id), email: account.email, role: account.role });
  }
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (dto.lastDonationAt && new Date(dto.lastDonationAt).getTime() > Date.now()) throw new BadRequestException('Last donation date cannot be in the future');
    if (await this.prisma.account.findUnique({ where: { email } })) throw new ConflictException('Email is already registered');
    const account = await this.prisma.account.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: UserRole.DONOR,
        donor: { create: {
          displayName: dto.displayName.trim(), bloodGroup: dto.bloodGroup, phoneEncrypted: encrypt(dto.phone), area: dto.area.trim(), community: tidyCommunity(dto.community),
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
