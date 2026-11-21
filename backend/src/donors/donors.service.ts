import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { decrypt, encrypt } from '../common/crypto';
import { eligible, DONATION_WAIT_DAYS } from '../common/matching';
import { CreateDonationDto, UpdateDonorDto } from './donors.dto';

@Injectable()
export class DonorsService {
  constructor(private prisma: PrismaService) {}
  async getMine(user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    return { ...donor, phone: decrypt(donor.phoneEncrypted), phoneEncrypted: undefined };
  }
  async update(user: AuthUser, dto: UpdateDonorDto) {
    const existing = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!existing) throw new NotFoundException('Donor profile not found');
    const { phone, lastDonationAt, ...fields } = dto;
    const donor = await this.prisma.donor.update({ where: { accountId: Number(user.sub) }, data: {
      ...fields, ...(phone ? { phoneEncrypted: encrypt(phone) } : {}),
      ...(lastDonationAt !== undefined ? { lastDonationAt: lastDonationAt ? new Date(lastDonationAt) : null } : {}),
    } });
    return { ...donor, phone: decrypt(donor.phoneEncrypted), phoneEncrypted: undefined };
  }
  async donations(user: AuthUser) {
    const donor = await this.mine(user);
    return this.prisma.donation.findMany({ where: { donorId: donor.id }, orderBy: { donatedAt: 'desc' }, select: { id: true, donatedAt: true } });
  }
  async addDonation(user: AuthUser, dto: CreateDonationDto) {
    const donor = await this.mine(user);
    const donatedAt = new Date(dto.donatedAt);
    if (donatedAt.getTime() > Date.now()) throw new BadRequestException('Donation date cannot be in the future');
    // Same instant twice (e.g. a double click) is a no-op instead of a duplicate entry.
    await this.prisma.donation.upsert({ where: { donorId_donatedAt: { donorId: donor.id, donatedAt } }, update: {}, create: { donorId: donor.id, donatedAt } });
    return this.syncLastDonation(donor.id);
  }
  async removeDonation(user: AuthUser, id: number) {
    const donor = await this.mine(user);
    const { count } = await this.prisma.donation.deleteMany({ where: { id, donorId: donor.id } });
    if (!count) throw new NotFoundException('Donation not found');
    return this.syncLastDonation(donor.id);
  }
  private async mine(user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    return donor;
  }
  // lastDonationAt drives eligibility and matching, so keep it equal to the newest history entry.
  private async syncLastDonation(donorId: number) {
    const latest = await this.prisma.donation.findFirst({ where: { donorId }, orderBy: { donatedAt: 'desc' } });
    const donor = await this.prisma.donor.update({ where: { id: donorId }, data: { lastDonationAt: latest?.donatedAt ?? null } });
    return { ...donor, phone: decrypt(donor.phoneEncrypted), phoneEncrypted: undefined };
  }
  async eligibility(user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    const eligibleNow = eligible(donor.lastDonationAt);
    const nextEligibleAt = donor.lastDonationAt ? new Date(donor.lastDonationAt.getTime() + DONATION_WAIT_DAYS * 86400000) : null;
    return {
      eligible: eligibleNow,
      nextEligibleAt,
      reason: donor.lastDonationAt ? 'Eligibility is estimated from the recorded last donation date.' : 'Last donation date is not recorded, so this prototype does not mark the donor eligible.',
      rule: `Estimated ${DONATION_WAIT_DAYS}-day interval since last donation; confirm eligibility with qualified medical staff.`,
    };
  }
}
