import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BloodRequest, OutreachStatus, RequestStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { decrypt } from '../common/crypto';
import { compatibleDonorGroups, distanceKm, eligible } from '../common/matching';
import { CreateRequestDto, OutreachDto } from './requests.dto';

const publicFields = { id: true, bloodGroup: true, units: true, hospitalName: true, area: true, latitude: true, longitude: true, urgency: true, verified: true, expiresAt: true, createdAt: true } as const;

type PublicRequest = { id: number };

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}
  // Attach outreach progress (donors coming / donated) so every response carries the same shape.
  private async withProgress<T extends PublicRequest>(requests: T[]) {
    const rows = await this.prisma.outreach.groupBy({ by: ['requestId', 'status'], where: { requestId: { in: requests.map((r) => r.id) }, status: { in: [OutreachStatus.COMING, OutreachStatus.DONATED] } }, _count: true });
    const count = (id: number, status: OutreachStatus) => rows.find((r) => r.requestId === id && r.status === status)?._count ?? 0;
    return requests.map((r) => ({ ...r, coming: count(r.id, OutreachStatus.COMING), donated: count(r.id, OutreachStatus.DONATED) }));
  }
  private async one<T extends PublicRequest>(request: T) { return (await this.withProgress([request]))[0]; }
  async listActive() {
    await this.prisma.bloodRequest.updateMany({ where: { status: RequestStatus.OPEN, expiresAt: { lte: new Date() } }, data: { status: RequestStatus.EXPIRED } });
    return this.withProgress(await this.prisma.bloodRequest.findMany({ where: { status: RequestStatus.OPEN, expiresAt: { gt: new Date() } }, select: publicFields, orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }] }));
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
  async match(id: number, maxDistanceKm = 50) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN || !request.verified) throw new BadRequestException('Request must be open and verified before matching');
    const donors = await this.prisma.donor.findMany({ where: { available: true, bloodGroup: { in: compatibleDonorGroups(request.bloodGroup) }, account: { isActive: true, role: UserRole.DONOR } }, include: { account: { select: { email: true } } } });
    const now = new Date();
    return donors.map((donor) => ({ donor, distance: distanceKm(request.latitude, request.longitude, donor.latitude, donor.longitude) }))
      .filter(({ donor, distance }) => eligible(donor.lastDonationAt, now) && distance <= maxDistanceKm)
      .sort((a, b) => a.distance - b.distance)
      .map(({ donor, distance }) => ({ donorId: donor.id, displayName: donor.displayName, bloodGroup: donor.bloodGroup, area: donor.area, distanceKm: Math.round(distance * 10) / 10, email: donor.account.email, phone: decrypt(donor.phoneEncrypted), eligibility: 'Estimated eligible; must be confirmed with the donor and medical staff.' }));
  }
  async close(id: number, status: RequestStatus) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN) throw new BadRequestException('Request is not open');
    return this.one(await this.prisma.bloodRequest.update({ where: { id }, data: { status }, select: publicFields }));
  }
  async outreach(id: number) {
    const request = await this.requestOrFail(id);
    const rows = await this.prisma.outreach.findMany({ where: { requestId: id }, include: { donor: { include: { account: { select: { email: true } } } } }, orderBy: { updatedAt: 'desc' } });
    return rows.map(({ donor, status, updatedAt }) => ({
      donorId: donor.id, displayName: donor.displayName, bloodGroup: donor.bloodGroup, area: donor.area, status, updatedAt,
      distanceKm: Math.round(distanceKm(request.latitude, request.longitude, donor.latitude, donor.longitude) * 10) / 10,
      email: donor.account.email, phone: decrypt(donor.phoneEncrypted),
    }));
  }
  async setOutreach(id: number, donorId: number, dto: OutreachDto) {
    const request = await this.requestOrFail(id);
    if (request.status !== RequestStatus.OPEN || !request.verified) throw new BadRequestException('Request must be open and verified');
    if (!(await this.prisma.donor.findUnique({ where: { id: donorId }, select: { id: true } }))) throw new NotFoundException('Donor not found');
    await this.prisma.outreach.upsert({ where: { requestId_donorId: { requestId: id, donorId } }, update: { status: dto.status }, create: { requestId: id, donorId, status: dto.status } });
    return this.one(await this.prisma.bloodRequest.findUniqueOrThrow({ where: { id }, select: publicFields }));
  }
}
