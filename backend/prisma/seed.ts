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
    const donor = await prisma.donor.upsert({ where: { accountId: account.id }, update: {}, create: {
      accountId: account.id, displayName: item.displayName, bloodGroup: item.bloodGroup,
      phoneEncrypted: encrypt(item.phone), area: item.area, latitude: item.latitude, longitude: item.longitude,
      available: true, lastDonationAt: new Date(Date.now() - item.daysAgo * 86400000),
    } });
    // A few past donations for the history timeline. Seeding runs on every start, so only fill a demo donor whose
    // history is empty or just the migration backfill.
    if ((await prisma.donation.count({ where: { donorId: donor.id } })) <= 1) {
      const latest = donor.lastDonationAt ?? new Date(Date.now() - item.daysAgo * 86400000);
      await prisma.donation.createMany({ skipDuplicates: true, data: [0, 120, 250].map((gap) => ({ donorId: donor.id, donatedAt: new Date(latest.getTime() - gap * 86400000) })) });
    }
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
  // A wider fictional community so matching, coverage and the map have something to work with.
  // Deterministic (no randomness) and idempotent: matched by email, existing rows are left alone.
  const AREAS: [string, number, number][] = [
    ['Kothrud', 18.5074, 73.8077], ['Deccan', 18.5167, 73.8418], ['Shivajinagar', 18.5308, 73.8475], ['Baner', 18.559, 73.7868],
    ['Aundh', 18.558, 73.8077], ['Hadapsar', 18.5089, 73.926], ['Viman Nagar', 18.5679, 73.9143], ['Kalyani Nagar', 18.5463, 73.9033],
    ['Camp', 18.515, 73.878], ['Swargate', 18.5018, 73.8636], ['Wakad', 18.5975, 73.7898], ['Karve Nagar', 18.4893, 73.8185],
    ['Kharadi', 18.5515, 73.9348], ['Pimple Saudagar', 18.599, 73.802], ['Katraj', 18.4575, 73.8677], ['Bibwewadi', 18.469, 73.865],
  ];
  const NAMES = ['Ishita', 'Aarav', 'Sneha', 'Vihaan', 'Diya', 'Arjun', 'Pooja', 'Siddharth', 'Riya', 'Nikhil', 'Tanvi', 'Omkar', 'Sakshi', 'Yash', 'Neha',
    'Pranav', 'Gauri', 'Harsh', 'Kavya', 'Manish', 'Aditi', 'Rahul', 'Shruti', 'Tejas', 'Mrunal', 'Varun', 'Anushka', 'Kunal', 'Prachi', 'Soham'];
  // Roughly India's distribution: lots of O+/B+/A+, a few negatives.
  const GROUPS: BloodGroup[] = ['O_POSITIVE', 'B_POSITIVE', 'A_POSITIVE', 'O_POSITIVE', 'B_POSITIVE', 'AB_POSITIVE', 'A_POSITIVE', 'O_NEGATIVE', 'B_POSITIVE', 'O_POSITIVE',
    'A_NEGATIVE', 'B_POSITIVE', 'O_POSITIVE', 'A_POSITIVE', 'B_NEGATIVE', 'O_POSITIVE', 'B_POSITIVE', 'AB_NEGATIVE', 'A_POSITIVE', 'O_POSITIVE',
    'B_POSITIVE', 'O_POSITIVE', 'A_POSITIVE', 'O_NEGATIVE', 'B_POSITIVE', 'AB_POSITIVE', 'O_POSITIVE', 'A_POSITIVE', 'B_POSITIVE', 'O_POSITIVE'];
  // null = first-time donor; small numbers = donated recently (not yet eligible).
  const DAYS_AGO: (number | null)[] = [null, 120, 30, 200, null, 95, 15, 400, 60, null, 150, 88, 365, null, 45, 110, 20, null, 250, 70, 180, null, 10, 140, 90, 300, null, 55, 130, 75];
  const communityHash = await bcrypt.hash('DonorDemo123!', 12); // one hash, reused: bcrypt is slow on purpose
  for (let i = 0; i < NAMES.length; i++) {
    const [area, lat, lng] = AREAS[i % AREAS.length];
    const email = `${NAMES[i].toLowerCase()}.${i + 1}@example.test`;
    const account = await prisma.account.upsert({ where: { email }, update: {}, create: { email, passwordHash: communityHash, role: UserRole.DONOR } });
    const days = DAYS_AGO[i];
    await prisma.donor.upsert({ where: { accountId: account.id }, update: {}, create: {
      accountId: account.id, displayName: NAMES[i], bloodGroup: GROUPS[i], phoneEncrypted: encrypt(`+9100000${String(100 + i).padStart(5, '0')}`),
      area, latitude: lat + ((i * 37) % 17 - 8) / 1000, longitude: lng + ((i * 53) % 17 - 8) / 1000, // ~±1 km spread, rounded later
      available: i % 9 !== 4, // a few have paused alerts
      lastDonationAt: days === null ? null : new Date(Date.now() - days * 86400000),
      ...(days === null ? {} : { donations: { create: [{ donatedAt: new Date(Date.now() - days * 86400000) }] } }),
    } });
  }

  // Demo drives, always a few days ahead so the demo never shows past events. Matched by title to stay idempotent.
  const day = (n: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(hour, 0, 0, 0); return d; };
  const demoDrives = [
    { title: 'COEP Rotaract Blood Drive (Demo)', organizer: 'Rotaract Club of COEP', venue: 'Main Auditorium, COEP', area: 'Shivajinagar', latitude: 18.5293, longitude: 73.8565, startsAt: day(2, 10), endsAt: day(2, 16), capacity: 120 },
    { title: 'Fergusson Mega Donation Camp (Demo)', organizer: 'NSS Unit, Fergusson College', venue: 'Amphitheatre, Fergusson College', area: 'Deccan', latitude: 18.5236, longitude: 73.8411, startsAt: day(5, 9), endsAt: day(5, 15), capacity: 200 },
    { title: 'Viman Nagar Community Drive (Demo)', organizer: 'Rotary Club of Pune East', venue: 'Community Hall, Viman Nagar', area: 'Viman Nagar', latitude: 18.5679, longitude: 73.9143, startsAt: day(12, 10), endsAt: day(12, 17), capacity: null },
  ];
  for (const d of demoDrives) {
    const existing = await prisma.drive.findFirst({ where: { title: d.title } });
    if (existing) await prisma.drive.update({ where: { id: existing.id }, data: d });
    else await prisma.drive.create({ data: { ...d, createdById: coordinator.id } });
  }
  console.log(`Seeded coordinator ${coordinatorEmail}, ${demoDonors.length + NAMES.length} fictional donors, demo request ${request.id}, and ${demoDrives.length} demo drives.`);
}

main().finally(() => prisma.$disconnect());
