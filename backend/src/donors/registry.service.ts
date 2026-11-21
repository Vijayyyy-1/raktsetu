import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BloodGroup, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { DONATION_WAIT_DAYS, eligible } from '../common/matching';
import { RegistryQueryDto, RegistryStatus } from './registry.dto';

const DAY = 86400000;
const SOON_DAYS = 14;

// Coordinator view of the registry. Deliberately no phone, email or exact location: contacting a donor
// still goes through a request's matches (one donor at a time, logged).
@Injectable()
export class RegistryService {
  private audit = new Logger('RegistryAudit');
  constructor(private prisma: PrismaService) {}

  // shortcut: loads all donors and filters in memory (fine for a college/city registry of a few thousand); move filters into SQL past that.
  private async all() {
    const now = new Date();
    const rows = await this.prisma.donor.findMany({
      where: { account: { role: UserRole.DONOR } },
      select: { id: true, displayName: true, bloodGroup: true, community: true, area: true, available: true, lastDonationAt: true, createdAt: true, account: { select: { isActive: true } }, _count: { select: { donations: true } } },
      orderBy: { displayName: 'asc' },
    });
    return rows.map((d) => {
      const next = d.lastDonationAt ? new Date(d.lastDonationAt.getTime() + DONATION_WAIT_DAYS * DAY) : null;
      const status: RegistryStatus = !d.account.isActive ? 'inactive' : !d.available ? 'paused' : eligible(d.lastDonationAt, now) ? 'eligible'
        : next && next.getTime() - now.getTime() <= SOON_DAYS * DAY ? 'soon' : 'resting';
      return {
        id: d.id, name: d.displayName, bloodGroup: d.bloodGroup, community: d.community, area: d.area, status,
        nextEligibleAt: status === 'soon' || status === 'resting' ? next : null,
        donations: d._count.donations, firstTimer: d._count.donations === 0 && !d.lastDonationAt, joinedAt: d.createdAt,
      };
    });
  }

  async list(q: RegistryQueryDto) {
    const text = q.q?.trim().toLowerCase();
    const community = q.community?.trim().toLowerCase();
    const items = (await this.all()).filter((d) =>
      (!q.group || d.bloodGroup === q.group) &&
      (!q.status || d.status === q.status) &&
      (!community || d.community?.toLowerCase() === community) &&
      (!text || [d.name, d.area, d.community ?? ''].some((s) => s.toLowerCase().includes(text))));
    const page = q.page ?? 1, pageSize = q.pageSize ?? 25;
    return { total: items.length, page, pageSize, items: items.slice((page - 1) * pageSize, page * pageSize) };
  }

  async stats() {
    const all = await this.all();
    const active = all.filter((d) => d.status !== 'inactive');
    const tally = (key: (d: (typeof all)[number]) => string) => {
      const m = new Map<string, { total: number; eligible: number }>();
      for (const d of active) {
        const v = m.get(key(d)) ?? { total: 0, eligible: 0 };
        v.total++;
        if (d.status === 'eligible') v.eligible++;
        m.set(key(d), v);
      }
      return m;
    };
    const byGroup = tally((d) => d.bloodGroup);
    const byCommunity = tally((d) => d.community ?? '');
    return {
      total: active.length,
      eligibleNow: active.filter((d) => d.status === 'eligible').length,
      soon: active.filter((d) => d.status === 'soon').length,
      paused: active.filter((d) => d.status === 'paused').length,
      firstTimers: active.filter((d) => d.firstTimer).length,
      inactive: all.length - active.length,
      byGroup: Object.values(BloodGroup).map((group) => ({ group, ...(byGroup.get(group) ?? { total: 0, eligible: 0 }) })),
      byCommunity: [...byCommunity].filter(([k]) => k).map(([community, v]) => ({ community, ...v })).sort((a, b) => b.total - a.total),
    };
  }

  /** Deactivate (fake/abusive sign-up) or reactivate. Inactive donors can't log in and are never matched. */
  async setActive(user: AuthUser, donorId: number, active: boolean) {
    const donor = await this.prisma.donor.findUnique({ where: { id: donorId }, select: { accountId: true } });
    if (!donor) throw new NotFoundException('Donor not found');
    await this.prisma.account.update({ where: { id: donor.accountId }, data: { isActive: active } });
    this.audit.log(`donor ${active ? 'reactivated' : 'deactivated'}: coordinator=${user.sub} donor=${donorId}`);
    return (await this.all()).find((d) => d.id === donorId);
  }
}
