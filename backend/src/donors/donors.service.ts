import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { decrypt, encrypt } from '../common/crypto';
import { eligible, DONATION_WAIT_DAYS } from '../common/matching';
import { UpdateDonorDto } from './donors.dto';

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
