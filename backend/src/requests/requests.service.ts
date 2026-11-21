import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BloodRequest, OutreachStatus, RequestStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { decrypt } from '../common/crypto';
import { compatibleDonorGroups, distanceKm, eligible } from '../common/matching';
import { CreateRequestDto, OutreachDto, UpdateRequestDto } from './requests.dto';

const publicFields = { id: true, bloodGroup: true, units: true, hospitalName: true, area: true, latitude: true, longitude: true, urgency: true, verified: true, expiresAt: true, createdAt: true, unitsReceived: true } as const;

type PublicRequest = { id: number };
// Donor positions leave the API rounded to ~1 km, whatever precision was stored.
const approx = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class RequestsService {
  private audit = new Logger('ContactAudit');
  constructor(private prisma: PrismaService) {}
  // Attach outreach progress (donors coming / donated) so every response carries the same shape.
  private async withProgress<T extends PublicRequest>(requests: T[]) {
    const rows = await this.prisma.outreach.groupBy({ by: ['requestId', 'status'], where: { requestId: { in: requests.map((r) => r.id) }, status: { in: [OutreachStatus.RESPONDED, OutreachStatus.COMING, OutreachStatus.DONATED] } }, _count: true });
    const count = (id: number, status: OutreachStatus) => rows.find((r) => r.requestId === id && r.status === status)?._count ?? 0;
    return requests.map((r) => ({ ...r, responded: count(r.id, OutreachStatus.RESPONDED), coming: count(r.id, OutreachStatus.COMING), donated: count(r.id, OutreachStatus.DONATED) }));
  }
  private async one<T extends PublicRequest>(request: T) { return (await this.withProgress([request]))[0]; }
  async listActive() {
    await this.prisma.bloodRequest.updateMany({ where: { status: RequestStatus.OPEN, expiresAt: { lte: new Date() } }, data: { status: RequestStatus.EXPIRED } });
    return this.withProgress(await this.prisma.bloodRequest.findMany({ where: { status: RequestStatus.OPEN, expiresAt: { gt: new Date() } }, select: publicFields, orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }] }));
  }
  // How many available, compatible, estimated-eligible donors sit near each open request, so thin coverage is visible before matching.
  async supply() {
    const now = new Date();
    const [requests, donors] = await Promise.all([
      this.prisma.bloodRequest.findMany({ where: { status: RequestStatus.OPEN, expiresAt: { gt: now } }, select: { id: true, bloodGroup: true, latitude: true, longitude: true } }),
      this.prisma.donor.findMany({ where: { available: true, account: { isActive: true, role: UserRole.DONOR } }, select: { bloodGroup: true, latitude: true, longitude: true, lastDonationAt: true } }),
    ]);
    const ready = donors.filter((d) => eligible(d.lastDonationAt, now));
    return requests.map((r) => {
      const groups = compatibleDonorGroups(r.bloodGroup);
      const km = ready.filter((d) => groups.includes(d.bloodGroup)).map((d) => distanceKm(r.latitude, r.longitude, d.latitude, d.longitude));
      return { id: r.id, within10: km.filter((k) => k <= 10).length, within25: km.filter((k) => k <= 25).length };
    });
  }
  // Closed history for coordinators: fulfilled, cancelled or expired in the last 30 days, newest first.
  async listClosed() {
    await this.prisma.bloodRequest.updateMany({ where: { status: RequestStatus.OPEN, expiresAt: { lte: new Date() } }, data: { status: RequestStatus.EXPIRED } });
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await this.prisma.bloodRequest.findMany({
      where: { status: { not: RequestStatus.OPEN }, updatedAt: { gte: since } },
      select: { ...publicFields, status: true, updatedAt: true, verifiedBy: { select: { email: true } } },
      orderBy: { updatedAt: 'desc' }, take: 100,
    });
    return this.withProgress(rows.map(({ updatedAt, verifiedBy, ...r }) => ({ ...r, closedAt: updatedAt, verifiedBy: verifiedBy?.email ?? null })));
  }
  // Public status for a shared link: verified requests only, any state, nothing about the patient or donors.
  async publicStatus(id: number) {
    const r = await this.prisma.bloodRequest.findFirst({ where: { id, verified: true }, select: { ...publicFields, status: true, updatedAt: true } });
    if (!r) throw new NotFoundException('Request not found');
    const expired = r.status === RequestStatus.OPEN && r.expiresAt <= new Date();
    const { updatedAt, ...rest } = await this.one(r);
    return { ...rest, status: expired ? RequestStatus.EXPIRED : r.status, closedAt: r.status === RequestStatus.OPEN ? (expired ? r.expiresAt : null) : updatedAt };
  }
  async get(id: number) {
    const request = await this.prisma.bloodRequest.findFirst({ where: { id, status: RequestStatus.OPEN, expiresAt: { gt: new Date() } }, select: publicFields });
    if (!request) throw new NotFoundException('Active request not found');
    return this.one(request);
  }
  async create(user: AuthUser, dto: CreateRequestDto) {
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) throw new BadRequestException('expiresAt must be in the future');
    return this.one(await this.prisma.bloodRequest.create({ data: { ...dto, expiresAt, createdById: Number(user.sub) }, select: publicFields }));
  }
  private async requestOrFail(id: number): Promise<BloodRequest> {
    const request = await this.prisma.bloodRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.expiresAt <= new Date() && request.status === RequestStatus.OPEN) {
      await this.prisma.bloodRequest.update({ where: { id }, data: { status: RequestStatus.EXPIRED } });
      throw new NotFoundException('Request has expired');
    }
    return request;
  }
  async verify(id: number, user: AuthUser) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN) throw new BadRequestException('Request is not open');
    return this.one(await this.prisma.bloodRequest.update({ where: { id }, data: { verified: true, verifiedById: Number(user.sub), verifiedAt: new Date() }, select: publicFields }));
  }
  // Aggregate outcomes for the last 30 days. Counts only, so it is safe to show publicly.
  async impact() {
    const since = new Date(Date.now() - 30 * 86400000);
    const closed = await this.prisma.bloodRequest.findMany({
      where: { verified: true, createdAt: { gte: since }, status: { in: [RequestStatus.FULFILLED, RequestStatus.EXPIRED] } },
      select: { id: true, status: true, createdAt: true, updatedAt: true, unitsReceived: true },
    });
    const filled = closed.filter((r) => r.status === RequestStatus.FULFILLED);
    const minutes = filled.map((r) => (r.updatedAt.getTime() - r.createdAt.getTime()) / 60000).sort((a, b) => a - b);
    const median = minutes.length ? (minutes[(minutes.length - 1) >> 1] + minutes[minutes.length >> 1]) / 2 : null;
    const [donated, raised, donors] = await Promise.all([
      this.prisma.outreach.count({ where: { status: OutreachStatus.DONATED, request: { createdAt: { gte: since } } } }),
      this.prisma.outreach.count({ where: { status: { in: [OutreachStatus.RESPONDED, OutreachStatus.COMING, OutreachStatus.DONATED] }, request: { createdAt: { gte: since } } } }),
      this.prisma.donor.findMany({ where: { account: { isActive: true, role: UserRole.DONOR } }, select: { lastDonationAt: true, available: true } }),
    ]);
    return {
      filled: filled.length,
      fillRate: closed.length ? Math.round((filled.length / closed.length) * 100) : null,
      medianFillMinutes: median === null ? null : Math.round(median),
      unitsArranged: donated + filled.reduce((n, r) => n + r.unitsReceived, 0),
      handsRaised: raised,
      donors: donors.length,
      eligibleNow: donors.filter((d) => d.available && eligible(d.lastDonationAt)).length,
    };
  }
  // Communities with at least one donor, for the coordinator's filter.
  async communities() {
    const rows = await this.prisma.donor.groupBy({ by: ['community'], where: { community: { not: null }, account: { isActive: true } }, _count: true, orderBy: { community: 'asc' } });
    return rows.map((r) => ({ name: r.community!, donors: r._count }));
  }
  async match(id: number, maxDistanceKm = 50, community?: string) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN || !request.verified) throw new BadRequestException('Request must be open and verified before matching');
    const donors = await this.prisma.donor.findMany({ where: { available: true, bloodGroup: { in: compatibleDonorGroups(request.bloodGroup) }, account: { isActive: true, role: UserRole.DONOR }, ...(community ? { community: { equals: community, mode: 'insensitive' } } : {}) } });
    const now = new Date();
    return donors.map((donor) => ({ donor, distance: distanceKm(request.latitude, request.longitude, donor.latitude, donor.longitude) }))
      .filter(({ donor, distance }) => eligible(donor.lastDonationAt, now) && distance <= maxDistanceKm)
      .sort((a, b) => a.distance - b.distance)
      .map(({ donor, distance }) => ({ donorId: donor.id, displayName: donor.displayName, bloodGroup: donor.bloodGroup, area: donor.area, community: donor.community, latitude: approx(donor.latitude), longitude: approx(donor.longitude), distanceKm: Math.round(distance * 10) / 10, eligibility: 'Estimated eligible; must be confirmed with the donor and medical staff.' }));
  }
  // Contact details are released one donor at a time, on purpose, and logged — never in bulk with match results.
  async contact(id: number, donorId: number, user: AuthUser) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN || !request.verified) throw new BadRequestException('Request must be open and verified');
    const donor = await this.prisma.donor.findUnique({ where: { id: donorId }, include: { account: { select: { email: true, isActive: true } } } });
    const existing = await this.prisma.outreach.findUnique({ where: { requestId_donorId: { requestId: id, donorId } } });
    const isMatch = donor && donor.account.isActive && donor.available && compatibleDonorGroups(request.bloodGroup).includes(donor.bloodGroup) && eligible(donor.lastDonationAt);
    if (!donor || (!isMatch && !existing)) throw new NotFoundException('This donor is not a match for this request');
    this.audit.log(`contact revealed: coordinator=${user.sub} donor=${donorId} request=${id}`);
    const consented = existing?.status === OutreachStatus.RESPONDED || existing?.status === OutreachStatus.COMING;
    return { donorId, email: donor.account.email, phone: decrypt(donor.phoneEncrypted), raisedHand: consented };
  }
  async close(id: number, status: RequestStatus) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN) throw new BadRequestException('Request is not open');
    return this.one(await this.prisma.bloodRequest.update({ where: { id }, data: { status }, select: publicFields }));
  }
  // Coordinator edits an open request. Once donations plus units arranged elsewhere cover the need, it closes as fulfilled.
  async update(id: number, dto: UpdateRequestDto) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN) throw new BadRequestException('Request is not open');
    const units = dto.units ?? request.units;
    const unitsReceived = dto.unitsReceived ?? request.unitsReceived;
    if (unitsReceived > units) throw new BadRequestException('Units received cannot exceed units needed');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('expiresAt must be in the future');
    if (expiresAt && expiresAt.getTime() > Date.now() + 7 * 86400000) throw new BadRequestException('expiresAt can be at most 7 days ahead');
    const donated = await this.prisma.outreach.count({ where: { requestId: id, status: OutreachStatus.DONATED } });
    const status = donated + unitsReceived >= units ? RequestStatus.FULFILLED : RequestStatus.OPEN;
    return this.one(await this.prisma.bloodRequest.update({ where: { id }, data: { units, unitsReceived, urgency: dto.urgency, expiresAt, status }, select: { ...publicFields, status: true } }));
  }
  async outreach(id: number) {
    const request = await this.requestOrFail(id);
    const rows = await this.prisma.outreach.findMany({ where: { requestId: id }, include: { donor: { include: { account: { select: { email: true } } } } }, orderBy: { updatedAt: 'desc' } });
    return rows.map(({ donor, status, updatedAt }) => ({
      donorId: donor.id, displayName: donor.displayName, bloodGroup: donor.bloodGroup, area: donor.area, latitude: approx(donor.latitude), longitude: approx(donor.longitude), status, updatedAt,
      distanceKm: Math.round(distanceKm(request.latitude, request.longitude, donor.latitude, donor.longitude) * 10) / 10,
      email: donor.account.email, phone: decrypt(donor.phoneEncrypted),
    }));
  }
  // Donor raises a hand. Only for open, verified requests their blood can serve, and only while they're estimated eligible.
  async respond(id: number, user: AuthUser) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN || !request.verified) throw new BadRequestException('Request is not open for responses');
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    if (!compatibleDonorGroups(request.bloodGroup).includes(donor.bloodGroup)) throw new BadRequestException('Your blood group cannot be given for this request');
    if (!donor.available) throw new BadRequestException('Turn on "Open to requests" first');
    if (!eligible(donor.lastDonationAt)) throw new BadRequestException('You may not be eligible to donate yet, based on your last donation date');
    const key = { requestId_donorId: { requestId: id, donorId: donor.id } };
    const existing = await this.prisma.outreach.findUnique({ where: key });
    // Don't overwrite what the coordinator already confirmed (coming / donated).
    if (!existing) await this.prisma.outreach.create({ data: { requestId: id, donorId: donor.id, status: OutreachStatus.RESPONDED } });
    else if (existing.status !== OutreachStatus.COMING && existing.status !== OutreachStatus.DONATED) await this.prisma.outreach.update({ where: key, data: { status: OutreachStatus.RESPONDED } });
    return this.one(await this.prisma.bloodRequest.findUniqueOrThrow({ where: { id }, select: publicFields }));
  }
  async withdraw(id: number, user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    const { count } = await this.prisma.outreach.deleteMany({ where: { requestId: id, donorId: donor.id, status: OutreachStatus.RESPONDED } });
    if (!count) throw new BadRequestException('Nothing to withdraw — if the coordinator already has you as coming, please tell them');
    return this.one(await this.prisma.bloodRequest.findUniqueOrThrow({ where: { id }, select: publicFields }));
  }
  async myResponses(user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    return this.prisma.outreach.findMany({ where: { donorId: donor.id }, select: { requestId: true, status: true } });
  }
  async setOutreach(id: number, donorId: number, dto: OutreachDto) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN || !request.verified) throw new BadRequestException('Request must be open and verified');
    if (!(await this.prisma.donor.findUnique({ where: { id: donorId }, select: { id: true } }))) throw new NotFoundException('Donor not found');
    const key = { requestId_donorId: { requestId: id, donorId } };
    const before = await this.prisma.outreach.findUnique({ where: key, select: { status: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.outreach.upsert({ where: key, update: { status: dto.status }, create: { requestId: id, donorId, status: dto.status } });
      // "Donated" is a real donation: it goes into the donor's history and restarts their eligibility clock.
      // Moving away from "donated" (a mis-click) takes that entry back out.
      const wasDonated = before?.status === OutreachStatus.DONATED, isDonated = dto.status === OutreachStatus.DONATED;
      if (isDonated && !wasDonated) await tx.donation.create({ data: { donorId, requestId: id, donatedAt: new Date() } });
      if (wasDonated && !isDonated) await tx.donation.deleteMany({ where: { donorId, requestId: id } });
      if (isDonated !== wasDonated) {
        const latest = await tx.donation.findFirst({ where: { donorId }, orderBy: { donatedAt: 'desc' } });
        await tx.donor.update({ where: { id: donorId }, data: { lastDonationAt: latest?.donatedAt ?? null } });
      }
    });
    return this.one(await this.prisma.bloodRequest.findUniqueOrThrow({ where: { id }, select: publicFields }));
  }
}
