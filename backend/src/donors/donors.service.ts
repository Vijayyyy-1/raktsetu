import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { tidyCommunity } from '../auth/auth.service';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { decrypt, encrypt } from '../common/crypto';
import { BloodGroup, RequestStatus } from '@prisma/client';
import { ALERT_KM, compatibleDonorGroups, distanceKm, eligible, DONATION_WAIT_DAYS } from '../common/matching';
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
    const { phone, community, ...fields } = dto;
    const donor = await this.prisma.donor.update({ where: { accountId: Number(user.sub) }, data: {
      ...fields, ...(phone ? { phoneEncrypted: encrypt(phone) } : {}),
      ...(community !== undefined ? { community: tidyCommunity(community) } : {}),
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
    const donation = await this.prisma.donation.findFirst({ where: { id, donorId: donor.id }, select: { requestId: true } });
    if (!donation) throw new NotFoundException('Donation not found');
    // A coordinator recorded this one against a request; removing it would also falsify that request's outcome.
    if (donation.requestId) throw new ConflictException('This donation was recorded by a coordinator for a request — ask them to correct it');
    await this.prisma.donation.delete({ where: { id } });
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
  // Alerts are derived, not stored: verified open requests this donor's blood can serve, within ALERT_KM.
  // Paused or not-yet-eligible donors get none, so nobody is pinged for a need they can't meet.
  async alerts(user: AuthUser) {
    const donor = await this.mine(user);
    if (!donor.available || !eligible(donor.lastDonationAt)) return { unread: 0, alerts: [] };
    const now = new Date();
    const open = await this.prisma.bloodRequest.findMany({
      where: { status: RequestStatus.OPEN, verified: true, expiresAt: { gt: now }, bloodGroup: { in: Object.values(BloodGroup).filter((g) => compatibleDonorGroups(g).includes(donor.bloodGroup)) } },
      select: { id: true, bloodGroup: true, units: true, hospitalName: true, area: true, latitude: true, longitude: true, urgency: true, expiresAt: true, verifiedAt: true },
      orderBy: { verifiedAt: 'desc' },
    });
    const alerts = open
      .map((r) => ({ ...r, distanceKm: Math.round(distanceKm(donor.latitude, donor.longitude, r.latitude, r.longitude) * 10) / 10, unread: !donor.alertsSeenAt || (r.verifiedAt ?? now) > donor.alertsSeenAt }))
      .filter((r) => r.distanceKm <= ALERT_KM);
    return { unread: alerts.filter((a) => a.unread).length, alerts };
  }
  // The phone's FCM token; a token moving to a new account is taken off the old one so pushes never reach the wrong donor.
  async setPushToken(user: AuthUser, token: string | null) {
    const donor = await this.mine(user);
    if (token) await this.prisma.donor.updateMany({ where: { pushToken: token, id: { not: donor.id } }, data: { pushToken: null } });
    await this.prisma.donor.update({ where: { id: donor.id }, data: { pushToken: token } });
    return { ok: true };
  }
  async markAlertsSeen(user: AuthUser) {
    const donor = await this.mine(user);
    await this.prisma.donor.update({ where: { id: donor.id }, data: { alertsSeenAt: new Date() } });
    return { unread: 0 };
  }
  async eligibility(user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    const eligibleNow = eligible(donor.lastDonationAt);
    const nextEligibleAt = donor.lastDonationAt ? new Date(donor.lastDonationAt.getTime() + DONATION_WAIT_DAYS * 86400000) : null;
    return {
      eligible: eligibleNow,
      nextEligibleAt,
      reason: donor.lastDonationAt ? 'Eligibility is estimated from the recorded last donation date.' : 'No donation recorded yet, so you are treated as a first-time donor and estimated eligible.',
      rule: `Estimated ${DONATION_WAIT_DAYS}-day interval since last donation; confirm eligibility with qualified medical staff.`,
    };
  }
}
