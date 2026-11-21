import { PrismaClient, BloodGroup, RequestUrgency, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { encrypt } from '../src/common/crypto';

const prisma = new PrismaClient();
const demoDonors = [
  { email: 'anaya@example.test', displayName: 'Anaya (Demo)', bloodGroup: BloodGroup.B_POSITIVE, phone: '+910000000001', area: 'Kothrud', latitude: 18.5074, longitude: 73.8077, daysAgo: 130 },
  { email: 'rohan@example.test', displayName: 'Rohan (Demo)', bloodGroup: BloodGroup.O_POSITIVE, phone: '+910000000002', area: 'Deccan', latitude: 18.5167, longitude: 73.8418, daysAgo: 18 },
  { email: 'meera@example.test', displayName: 'Meera (Demo)', bloodGroup: BloodGroup.O_NEGATIVE, phone: '+910000000003', area: 'Shivajinagar', latitude: 18.5308, longitude: 73.8475, daysAgo: 100 },
  { email: 'kabir@example.test', displayName: 'Kabir (Demo)', bloodGroup: BloodGroup.B_POSITIVE, phone: '+910000000004', area: 'Baner', latitude: 18.559, longitude: 73.7868, daysAgo: 75 },
];

async function main() {
  const password = process.env.COORDINATOR_PASSWORD || 'ChangeMe123!';
  const coordinatorEmail = (process.env.COORDINATOR_EMAIL || 'coordinator@example.test').toLowerCase();
  const coordinatorPasswordHash = await bcrypt.hash(password, 12);
  const coordinator = await prisma.account.upsert({ where: { email: coordinatorEmail }, update: {
    passwordHash: coordinatorPasswordHash, role: UserRole.COORDINATOR, isActive: true,
  }, create: {
    email: coordinatorEmail, passwordHash: coordinatorPasswordHash, role: UserRole.COORDINATOR,
  } });
  for (const item of demoDonors) {
    const account = await prisma.account.upsert({ where: { email: item.email }, update: {}, create: {
      email: item.email, passwordHash: await bcrypt.hash('DonorDemo123!', 12), role: UserRole.DONOR,
    } });
    await prisma.donor.upsert({ where: { accountId: account.id }, update: {}, create: {
      accountId: account.id, displayName: item.displayName, bloodGroup: item.bloodGroup,
      phoneEncrypted: encrypt(item.phone), area: item.area, latitude: item.latitude, longitude: item.longitude,
      available: true, lastDonationAt: new Date(Date.now() - item.daysAgo * 86400000),
    } });
  }
  const expiresAt = new Date(Date.now() + 48 * 3600000);
  const demoRequest = await prisma.bloodRequest.findFirst({ where: { hospitalName: 'City Hospital (Demo)', bloodGroup: BloodGroup.B_POSITIVE } });
  const requestData = {
    bloodGroup: BloodGroup.B_POSITIVE, units: 2,
    hospitalName: 'City Hospital (Demo)', area: 'Shivajinagar', latitude: 18.5204, longitude: 73.8567,
    urgency: RequestUrgency.CRITICAL, verified: true, verifiedById: coordinator.id, verifiedAt: new Date(),
    expiresAt, createdById: coordinator.id,
  };
  const request = demoRequest
    ? await prisma.bloodRequest.update({ where: { id: demoRequest.id }, data: requestData })
    : await prisma.bloodRequest.create({ data: requestData });
  console.log(`Seeded coordinator ${coordinatorEmail}, ${demoDonors.length} fictional donors, and demo request ${request.id}.`);
}

main().finally(() => prisma.$disconnect());
