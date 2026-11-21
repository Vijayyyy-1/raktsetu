import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Everything a test run creates uses this email domain, so cleanup can never touch real or seeded data.
export const TEST_DOMAIN = '@test.raktsetu';
const RUN = Date.now().toString(36);
export const email = (name: string) => `${name}.${RUN}${TEST_DOMAIN}`;

// Far from the Pune seed data (central India), so matches only ever include this run's donors.
export const BASE = { lat: 21.0, lng: 79.0 };
/** A point `km` north and `kmEast` east of BASE. */
export const at = (kmNorth: number, kmEast = 0) => ({ latitude: BASE.lat + kmNorth / 111, longitude: BASE.lng + kmEast / (111 * Math.cos((BASE.lat * Math.PI) / 180)) });
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
export const hoursAhead = (n: number) => new Date(Date.now() + n * 3600000).toISOString();

export const prisma = new PrismaClient();

export async function startApi(): Promise<{ app: INestApplication; api: Api }> {
  const app = configureApp(await NestFactory.create(AppModule, { logger: false }));
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address();
  return { app, api: client(`http://127.0.0.1:${port}/v1`) };
}

export type Res = { status: number; body: any };
export type Api = ReturnType<typeof client>;
function client(base: string) {
  const send = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Res> => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body };
  };
  return {
    get: (path: string, token?: string) => send('GET', path, { token }),
    post: (path: string, body?: unknown, token?: string) => send('POST', path, { body, token }),
    patch: (path: string, body: unknown, token?: string) => send('PATCH', path, { body, token }),
    put: (path: string, body: unknown, token?: string) => send('PUT', path, { body, token }),
    del: (path: string, token?: string) => send('DELETE', path, { token }),
  };
}

/** Coordinators can't self-register, so create one directly and log in through the API. */
export async function makeCoordinator(api: Api, name = 'coord') {
  const password = 'Coordinator-Test-123';
  await prisma.account.create({ data: { email: email(name), passwordHash: await bcrypt.hash(password, 4), role: UserRole.COORDINATOR } });
  const res = await api.post('/auth/login', { email: email(name), password });
  if (res.status !== 201) throw new Error(`coordinator login failed: ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

type DonorSpec = { name: string; group: string; kmNorth: number; kmEast?: number; lastDonationDaysAgo?: number; available?: boolean };
/** Registers a donor through the public sign-up endpoint, exactly like the app does. */
export async function makeDonor(api: Api, d: DonorSpec) {
  const res = await api.post('/auth/register', {
    email: email(d.name), password: 'Donor-Test-12345', displayName: d.name, bloodGroup: d.group,
    phone: '+91 90000 0' + String(Math.floor(Math.random() * 9000) + 1000), area: 'Test Area', ...at(d.kmNorth, d.kmEast),
    ...(d.lastDonationDaysAgo !== undefined ? { lastDonationAt: daysAgo(d.lastDonationDaysAgo) } : {}),
  });
  if (res.status !== 201) throw new Error(`register ${d.name} failed: ${JSON.stringify(res.body)}`);
  const token = res.body.accessToken as string;
  if (d.available === false) await api.patch('/donors/me', { available: false }, token);
  const me = await api.get('/donors/me', token);
  return { token, id: me.body.id as number, name: d.name };
}

/** Removes everything this (or a crashed earlier) test run created. Order matters: requests/drives restrict account deletion. */
export async function cleanup() {
  const mine = { email: { endsWith: TEST_DOMAIN } };
  await prisma.bloodRequest.deleteMany({ where: { createdBy: mine } });
  await prisma.drive.deleteMany({ where: { createdBy: mine } });
  await prisma.account.deleteMany({ where: mine });
}
