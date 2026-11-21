import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/auth';
import { distanceKm } from '../common/matching';
import { CreateDriveDto } from './drives.dto';

const publicFields = { id: true, title: true, organizer: true, venue: true, area: true, latitude: true, longitude: true, startsAt: true, endsAt: true, capacity: true, _count: { select: { rsvps: true } } } as const;
type DriveRow = Prisma.DriveGetPayload<{ select: typeof publicFields }>;
const toPublic = ({ _count, ...d }: DriveRow, km?: number) => ({ ...d, rsvpCount: _count.rsvps, ...(km !== undefined ? { distanceKm: Math.round(km * 10) / 10 } : {}) });

@Injectable()
export class DrivesService {
  constructor(private prisma: PrismaService) {}
  /** Upcoming and ongoing drives, soonest first; distance included when a location is given. */
  async listUpcoming(lat?: number, lng?: number) {
    const drives = await this.prisma.drive.findMany({ where: { endsAt: { gt: new Date() } }, select: publicFields, orderBy: { startsAt: 'asc' }, take: 50 });
    const near = lat !== undefined && lng !== undefined;
    return drives.map((d) => toPublic(d, near ? distanceKm(lat, lng, d.latitude, d.longitude) : undefined));
  }
  async create(user: AuthUser, dto: CreateDriveDto) {
    const startsAt = new Date(dto.startsAt), endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    if (endsAt <= new Date()) throw new BadRequestException('Drive must end in the future');
    return toPublic(await this.prisma.drive.create({ data: { ...dto, startsAt, endsAt, createdById: Number(user.sub) }, select: publicFields }));
  }
  private async donorId(user: AuthUser) {
    const donor = await this.prisma.donor.findUnique({ where: { accountId: Number(user.sub) }, select: { id: true } });
    if (!donor) throw new NotFoundException('Donor profile not found');
    return donor.id;
  }
  async myRsvps(user: AuthUser) {
    const rows = await this.prisma.driveRsvp.findMany({ where: { donorId: await this.donorId(user) }, select: { driveId: true } });
    return rows.map((r) => r.driveId);
  }
  async rsvp(user: AuthUser, driveId: number) {
    const donorId = await this.donorId(user);
    const drive = await this.prisma.drive.findUnique({ where: { id: driveId }, select: { ...publicFields } });
    if (!drive || drive.endsAt <= new Date()) throw new NotFoundException('Upcoming drive not found');
    if (drive.capacity !== null && drive._count.rsvps >= drive.capacity) throw new ConflictException('This drive is full');
    await this.prisma.driveRsvp.upsert({ where: { driveId_donorId: { driveId, donorId } }, update: {}, create: { driveId, donorId } });
    return toPublic(await this.prisma.drive.findUniqueOrThrow({ where: { id: driveId }, select: publicFields }));
  }
  async cancelRsvp(user: AuthUser, driveId: number) {
    await this.prisma.driveRsvp.deleteMany({ where: { driveId, donorId: await this.donorId(user) } });
    const drive = await this.prisma.drive.findUnique({ where: { id: driveId }, select: publicFields });
    if (!drive) throw new NotFoundException('Drive not found');
    return toPublic(drive);
  }
}
