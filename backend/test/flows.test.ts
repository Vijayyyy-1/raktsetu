// End-to-end tests: the real Nest app (same config as production) against the real database.
// Every record is created at a remote test location with a @test.raktsetu email and removed afterwards.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { INestApplication } from '@nestjs/common';
import { DONATION_WAIT_DAYS } from '../src/common/matching';
import { Api, BASE, at, cleanup, daysAgo, email, hoursAhead, makeCoordinator, makeDonor, prisma, startApi } from './helpers';

let app: INestApplication;
let api: Api;
let coord: string;
type Donor = Awaited<ReturnType<typeof makeDonor>>;
const d: Record<string, Donor> = {};

before(async () => {
  await cleanup(); // leftovers from a crashed run
  ({ app, api } = await startApi());
  coord = await makeCoordinator(api);
  // The cast for a B+ request at BASE:
  d.bPos = await makeDonor(api, { name: 'bpos', group: 'B_POSITIVE', kmNorth: 2, lastDonationDaysAgo: 120 }); // match, nearest
  d.oNeg = await makeDonor(api, { name: 'oneg', group: 'O_NEGATIVE', kmNorth: 0, kmEast: 3 }); // match, first-timer
  d.aPos = await makeDonor(api, { name: 'apos', group: 'A_POSITIVE', kmNorth: 1, lastDonationDaysAgo: 200 }); // wrong group
  d.recent = await makeDonor(api, { name: 'recent', group: 'B_POSITIVE', kmNorth: 1.5, lastDonationDaysAgo: 10 }); // donated recently
  d.paused = await makeDonor(api, { name: 'paused', group: 'B_POSITIVE', kmNorth: 2.5, lastDonationDaysAgo: 300, available: false }); // opted out
  d.far = await makeDonor(api, { name: 'far', group: 'B_POSITIVE', kmNorth: 30, lastDonationDaysAgo: 300 }); // outside 10 km
});

after(async () => {
  await cleanup();
  await app?.close();
  await prisma.$disconnect();
});

const newRequest = (body: Partial<Record<string, unknown>> = {}) =>
  api.post('/blood-requests', { bloodGroup: 'B_POSITIVE', units: 2, hospitalName: 'Test Hospital', area: 'Test Area', ...at(0), urgency: 'CRITICAL', expiresAt: hoursAhead(6), ...body }, coord);
const verified = async (body?: Partial<Record<string, unknown>>) => {
  const r = await newRequest(body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await api.post(`/blood-requests/${r.body.id}/verify`, undefined, coord)).status, 201);
  return r.body.id as number;
};
const matchIds = async (id: number, km = 10) => {
  const r = await api.post(`/blood-requests/${id}/matches?maxDistanceKm=${km}`, undefined, coord);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body as any[];
};
const outreachOf = async (id: number) => (await api.get(`/blood-requests/${id}/outreach`, coord)).body as any[];

/* ------------------------------------------------------------------ */
describe('auth & roles', () => {
  test('public sign-up always creates a DONOR, even if the body asks for COORDINATOR', async () => {
    const r = await api.post('/auth/register', { email: email('sneaky'), password: 'Sneaky-Test-123', displayName: 'Sneaky', bloodGroup: 'O_POSITIVE', phone: '+91 90000 11111', area: 'Test Area', ...at(50), role: 'COORDINATOR' });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'DONOR');
    assert.equal((await api.get('/auth/me', r.body.accessToken)).body.role, 'DONOR');
  });

  test('duplicate email is rejected (409)', async () => {
    const r = await api.post('/auth/register', { email: email('bpos'), password: 'Another-Test-123', displayName: 'Dup', bloodGroup: 'O_POSITIVE', phone: '+91 90000 22222', area: 'Test Area', ...at(50) });
    assert.equal(r.status, 409);
  });

  test('password shorter than 10 characters is rejected (400)', async () => {
    const r = await api.post('/auth/register', { email: email('short'), password: 'short', displayName: 'Short', bloodGroup: 'O_POSITIVE', phone: '+91 90000 33333', area: 'Test Area', ...at(50) });
    assert.equal(r.status, 400);
  });

  test('wrong password → 401, and the message does not reveal whether the email exists', async () => {
    const wrong = await api.post('/auth/login', { email: email('bpos'), password: 'not-the-password' });
    const unknown = await api.post('/auth/login', { email: email('nobody'), password: 'not-the-password' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  test('protected routes need a token (401) and the right role (403)', async () => {
    assert.equal((await api.get('/donors/me')).status, 401);
    assert.equal((await api.get('/donors/me', coord)).status, 403); // coordinator has no donor profile route
    assert.equal((await newRequestAs(d.bPos.token)).status, 403); // donors can't post requests
  });

  test('/auth/me never includes the phone number', async () => {
    const me = await api.get('/auth/me', d.bPos.token);
    assert.equal(me.status, 200);
    assert.ok(!JSON.stringify(me.body).includes('phone'));
  });
});
const newRequestAs = (token: string) =>
  api.post('/blood-requests', { bloodGroup: 'B_POSITIVE', units: 1, hospitalName: 'X', area: 'X', ...at(0), urgency: 'URGENT', expiresAt: hoursAhead(2) }, token);

/* ------------------------------------------------------------------ */
describe('request → verify → match', () => {
  let id: number;

  test('a new request starts OPEN and unverified', async () => {
    const r = await newRequest();
    assert.equal(r.status, 201);
    assert.equal(r.body.verified, false);
    id = r.body.id;
  });

  test('cannot match before verifying (no fake "urgent" requests)', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/matches`, undefined, coord)).status, 400);
  });

  test('donors cannot raise a hand on an unverified request', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/respond`, undefined, d.bPos.token)).status, 400);
  });

  test('expiry in the past is rejected', async () => {
    assert.equal((await newRequest({ expiresAt: daysAgo(1) })).status, 400);
  });

  test('verify records the verifier', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/verify`, undefined, coord)).status, 201);
    const row = await prisma.bloodRequest.findUniqueOrThrow({ where: { id } });
    assert.equal(row.verified, true);
    assert.ok(row.verifiedById && row.verifiedAt);
  });

  test('within 10 km: only compatible, available, eligible donors — nearest first', async () => {
    const m = await matchIds(id, 10);
    assert.deepEqual(m.map((x) => x.donorId), [d.bPos.id, d.oNeg.id]); // 2 km, then 3 km
    assert.ok(m[0].distanceKm <= m[1].distanceKm);
  });

  test('excluded donors and why: wrong group, donated recently, paused, too far', async () => {
    const ids = (await matchIds(id, 10)).map((x) => x.donorId);
    for (const who of ['aPos', 'recent', 'paused', 'far']) assert.ok(!ids.includes(d[who].id), `${who} should not match`);
  });

  test('a wider radius brings in the far donor, last', async () => {
    const m = await matchIds(id, 50);
    assert.equal(m.at(-1).donorId, d.far.id);
  });

  test('first-time donor (no donation date) is matched', async () => {
    assert.ok((await matchIds(id, 10)).some((x) => x.donorId === d.oNeg.id));
  });

  test('match results never include phone or email', async () => {
    const m = await matchIds(id, 50);
    for (const row of m) {
      assert.equal(row.phone, undefined);
      assert.equal(row.email, undefined);
    }
  });

  test('donor location in match results is rounded (~1 km), not exact', async () => {
    const m = await matchIds(id, 10);
    for (const row of m) assert.ok(Math.abs(row.latitude * 100 - Math.round(row.latitude * 100)) < 1e-9, `${row.latitude} not rounded`);
  });
});

/* ------------------------------------------------------------------ */
describe('donor says "I can come" → coordinator sees it', () => {
  let id: number;
  before(async () => (id = await verified()));

  test('wrong blood group cannot raise a hand', async () => {
    const r = await api.post(`/blood-requests/${id}/respond`, undefined, d.aPos.token);
    assert.equal(r.status, 400);
  });

  test('a donor who gave blood recently cannot raise a hand', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/respond`, undefined, d.recent.token)).status, 400);
  });

  test('a paused donor is asked to turn alerts back on', async () => {
    const r = await api.post(`/blood-requests/${id}/respond`, undefined, d.paused.token);
    assert.equal(r.status, 400);
    assert.match(r.body.message, /Open to requests/);
  });

  test('matching donor raises a hand → it shows in their own responses', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/respond`, undefined, d.bPos.token)).status, 201);
    const mine = (await api.get('/blood-requests/responses/me', d.bPos.token)).body as any[];
    assert.deepEqual(mine.find((x) => x.requestId === id), { requestId: id, status: 'RESPONDED' });
  });

  test('raising a hand twice does not create duplicates', async () => {
    await api.post(`/blood-requests/${id}/respond`, undefined, d.bPos.token);
    assert.equal((await outreachOf(id)).filter((o) => o.donorId === d.bPos.id).length, 1);
  });

  test('coordinator sees the donor in the outreach list as RESPONDED', async () => {
    const o = (await outreachOf(id)).find((x) => x.donorId === d.bPos.id);
    assert.equal(o?.status, 'RESPONDED');
  });

  test('the request carries the response count', async () => {
    const r = await api.get(`/blood-requests/${id}`);
    assert.equal(r.body.responded, 1);
  });

  test('coordinator gets the contact on purpose — flagged as having raised a hand', async () => {
    const c = await api.post(`/blood-requests/${id}/matches/${d.bPos.id}/contact`, undefined, coord);
    assert.equal(c.status, 201);
    assert.equal(c.body.raisedHand, true);
    assert.match(c.body.phone, /^\+91/);
    assert.equal(c.body.email, email('bpos'));
  });

  test('contact for a match who has not responded yet works, flagged false', async () => {
    const c = await api.post(`/blood-requests/${id}/matches/${d.oNeg.id}/contact`, undefined, coord);
    assert.equal(c.status, 201);
    assert.equal(c.body.raisedHand, false);
  });

  test('contact for a donor who does not match is refused (404)', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/matches/${d.aPos.id}/contact`, undefined, coord)).status, 404);
  });

  test('donors cannot look up other donors\' contacts (403)', async () => {
    assert.equal((await api.post(`/blood-requests/${id}/matches/${d.oNeg.id}/contact`, undefined, d.bPos.token)).status, 403);
  });

  test('donor can withdraw while still RESPONDED; withdrawing twice fails', async () => {
    assert.equal((await api.del(`/blood-requests/${id}/respond`, d.bPos.token)).status, 200);
    assert.equal((await outreachOf(id)).some((o) => o.donorId === d.bPos.id), false);
    assert.equal((await api.del(`/blood-requests/${id}/respond`, d.bPos.token)).status, 400);
  });

  test('once the coordinator marks them COMING, the donor cannot silently withdraw', async () => {
    await api.post(`/blood-requests/${id}/respond`, undefined, d.bPos.token);
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${d.bPos.id}`, { status: 'COMING' }, coord)).status, 200);
    assert.equal((await api.del(`/blood-requests/${id}/respond`, d.bPos.token)).status, 400);
  });

  test('raising a hand again does not downgrade COMING back to RESPONDED', async () => {
    await api.post(`/blood-requests/${id}/respond`, undefined, d.bPos.token);
    assert.equal((await outreachOf(id)).find((o) => o.donorId === d.bPos.id)?.status, 'COMING');
  });

  test('coordinator can log a call that went unanswered', async () => {
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${d.oNeg.id}`, { status: 'NO_ANSWER' }, coord)).status, 200);
    assert.equal((await outreachOf(id)).find((o) => o.donorId === d.oNeg.id)?.status, 'NO_ANSWER');
  });

  test('invalid outreach status is rejected (400)', async () => {
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${d.oNeg.id}`, { status: 'MAYBE' }, coord)).status, 400);
  });
});

/* ------------------------------------------------------------------ */
describe('fulfilment', () => {
  // Marking DONATED changes the donor (new donation, ineligible), so these tests use fresh donors, never the shared cast.
  let n = 0;
  const fresh = () => makeDonor(api, { name: `fresh${++n}`, group: 'O_NEGATIVE', kmNorth: 0.5 + n / 10 });

  test('2 units: both donors DONATED → request closes as FULFILLED and leaves the public feed', async () => {
    const id = await verified({ units: 2 });
    const [x, y] = [await fresh(), await fresh()];
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${x.id}`, { status: 'DONATED' }, coord)).body.status, 'OPEN'); // 1 of 2
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${y.id}`, { status: 'DONATED' }, coord)).body.status, 'FULFILLED'); // closes itself
    assert.ok(!((await api.get('/blood-requests')).body as any[]).some((x) => x.id === id));
  });

  test('partial: 1 donated + 1 unit from a blood bank covers a 3-unit need only at the 3rd unit', async () => {
    const id = await verified({ units: 3 });
    await api.put(`/blood-requests/${id}/outreach/${(await fresh()).id}`, { status: 'DONATED' }, coord);
    assert.equal((await api.patch(`/blood-requests/${id}`, { unitsReceived: 1 }, coord)).body.status, 'OPEN');
    assert.equal((await api.patch(`/blood-requests/${id}`, { unitsReceived: 2 }, coord)).body.status, 'FULFILLED');
  });

  test('units received cannot exceed units needed', async () => {
    const id = await verified({ units: 2 });
    assert.equal((await api.patch(`/blood-requests/${id}`, { unitsReceived: 3 }, coord)).status, 400);
  });

  test('after fulfilment: no matching, no new hands raised, cannot cancel', async () => {
    const id = await verified({ units: 1 });
    assert.equal((await api.post(`/blood-requests/${id}/fulfill`, undefined, coord)).status, 201);
    assert.equal((await api.post(`/blood-requests/${id}/matches`, undefined, coord)).status, 400);
    assert.equal((await api.post(`/blood-requests/${id}/respond`, undefined, d.oNeg.token)).status, 400);
    assert.equal((await api.post(`/blood-requests/${id}/cancel`, undefined, coord)).status, 400);
  });

  test('cancelled requests leave the public feed', async () => {
    const id = await verified();
    assert.equal((await api.post(`/blood-requests/${id}/cancel`, undefined, coord)).status, 201);
    assert.ok(!((await api.get('/blood-requests')).body as any[]).some((x) => x.id === id));
  });

  test('marking DONATED alone closes the request once units are covered', async () => {
    const id = await verified({ units: 1 });
    await api.put(`/blood-requests/${id}/outreach/${(await fresh()).id}`, { status: 'DONATED' }, coord);
    assert.equal((await api.get(`/blood-requests/${id}`)).status, 404); // closed requests aren't public
  });

  test('marking a donor DONATED records the donation, makes them ineligible and drops them from matches', async () => {
    const donor = await fresh();
    const id = await verified({ units: 2 });
    assert.ok((await matchIds(id)).some((m) => m.donorId === donor.id));
    await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'DONATED' }, coord);
    assert.equal(((await api.get('/donors/me/donations', donor.token)).body as any[]).length, 1);
    assert.equal((await api.get('/donors/me/eligibility', donor.token)).body.eligible, false);
    assert.ok(!(await matchIds(id)).some((m) => m.donorId === donor.id));
  });

  test('undoing a mis-clicked DONATED removes that donation and restores eligibility', async () => {
    const donor = await fresh();
    const id = await verified({ units: 2 });
    await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'DONATED' }, coord);
    await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'COMING' }, coord);
    assert.equal(((await api.get('/donors/me/donations', donor.token)).body as any[]).length, 0);
    assert.equal((await api.get('/donors/me/eligibility', donor.token)).body.eligible, true);
  });
});

/* ------------------------------------------------------------------ */
describe('expiry', () => {
  test('an expired request disappears from the feed, is marked EXPIRED, and cannot be matched', async () => {
    const id = await verified();
    await prisma.bloodRequest.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60000) } }); // simulate time passing
    assert.ok(!((await api.get('/blood-requests')).body as any[]).some((x) => x.id === id));
    assert.equal((await prisma.bloodRequest.findUniqueOrThrow({ where: { id } })).status, 'EXPIRED');
    assert.equal((await api.post(`/blood-requests/${id}/matches`, undefined, coord)).status, 400);
  });

  test('expiry can only be extended up to 7 days ahead', async () => {
    const id = await verified();
    assert.equal((await api.patch(`/blood-requests/${id}`, { expiresAt: hoursAhead(24 * 8) }, coord)).status, 400);
    assert.equal((await api.patch(`/blood-requests/${id}`, { expiresAt: hoursAhead(24 * 2) }, coord)).status, 200);
  });
});

/* ------------------------------------------------------------------ */
describe('eligibility & donation history', () => {
  test('first-time donor is estimated eligible, with a clear reason', async () => {
    const e = (await api.get('/donors/me/eligibility', d.oNeg.token)).body;
    assert.equal(e.eligible, true);
    assert.equal(e.nextEligibleAt, null);
    assert.match(e.reason, /first-time/);
  });

  test(`logging a donation today makes them ineligible for ${DONATION_WAIT_DAYS} days`, async () => {
    const donor = await makeDonor(api, { name: 'logger', group: 'O_POSITIVE', kmNorth: 40 });
    const now = new Date().toISOString();
    assert.equal((await api.post('/donors/me/donations', { donatedAt: now }, donor.token)).status, 201);
    const e = (await api.get('/donors/me/eligibility', donor.token)).body;
    assert.equal(e.eligible, false);
    const days = (Date.parse(e.nextEligibleAt) - Date.parse(now)) / 86400000;
    assert.ok(Math.abs(days - DONATION_WAIT_DAYS) < 0.01, `next eligible in ${days} days`);
  });

  test('the same donation logged twice (double click) is stored once', async () => {
    const donor = await makeDonor(api, { name: 'double', group: 'O_POSITIVE', kmNorth: 41 });
    const when = daysAgo(100);
    await api.post('/donors/me/donations', { donatedAt: when }, donor.token);
    await api.post('/donors/me/donations', { donatedAt: when }, donor.token);
    assert.equal(((await api.get('/donors/me/donations', donor.token)).body as any[]).length, 1);
  });

  test('removing the latest donation restores eligibility', async () => {
    const donor = await makeDonor(api, { name: 'undo', group: 'O_POSITIVE', kmNorth: 42 });
    await api.post('/donors/me/donations', { donatedAt: new Date().toISOString() }, donor.token);
    const [latest] = (await api.get('/donors/me/donations', donor.token)).body as any[];
    assert.equal((await api.del(`/donors/me/donations/${latest.id}`, donor.token)).status, 200);
    assert.equal((await api.get('/donors/me/eligibility', donor.token)).body.eligible, true);
  });

  test('a donation date in the future is rejected', async () => {
    assert.equal((await api.post('/donors/me/donations', { donatedAt: hoursAhead(48) }, d.aPos.token)).status, 400);
  });

  test('pausing availability removes a donor from matches; resuming brings them back', async () => {
    const id = await verified();
    await api.patch('/donors/me', { available: false }, d.oNeg.token);
    assert.ok(!(await matchIds(id)).some((m) => m.donorId === d.oNeg.id));
    await api.patch('/donors/me', { available: true }, d.oNeg.token);
    assert.ok((await matchIds(id)).some((m) => m.donorId === d.oNeg.id));
  });
});

/* ------------------------------------------------------------------ */
describe('drives & RSVPs', () => {
  let driveId: number;
  const drive = (extra: Record<string, unknown> = {}) => ({
    title: 'Test Drive', organizer: 'Test Rotaract', venue: 'Test Hall', area: 'Test Area', ...at(1), startsAt: hoursAhead(24), endsAt: hoursAhead(30), capacity: 1, ...extra,
  });

  test('coordinator posts a drive; donors cannot', async () => {
    const r = await api.post('/drives', drive(), coord);
    assert.equal(r.status, 201);
    driveId = r.body.id;
    assert.equal((await api.post('/drives', drive(), d.bPos.token)).status, 403);
  });

  test('a drive must end after it starts', async () => {
    assert.equal((await api.post('/drives', drive({ endsAt: hoursAhead(20) }), coord)).status, 400);
  });

  test('public list includes the drive, with distance when a location is given', async () => {
    const list = (await api.get(`/drives?lat=${BASE.lat}&lng=${BASE.lng}`)).body as any[];
    const mine = list.find((x) => x.id === driveId);
    assert.ok(mine);
    assert.ok(mine.distanceKm > 0.5 && mine.distanceKm < 1.5, `distance ${mine.distanceKm}`);
  });

  test('RSVP counts once even if repeated; shows in the donor\'s RSVPs', async () => {
    const first = await api.post(`/drives/${driveId}/rsvp`, undefined, d.bPos.token);
    assert.equal(first.body.rsvpCount, 1, `${first.status} ${JSON.stringify(first.body)}`);
    assert.equal((await api.post(`/drives/${driveId}/rsvp`, undefined, d.bPos.token)).body.rsvpCount, 1);
    assert.ok(((await api.get('/drives/rsvps/me', d.bPos.token)).body as number[]).includes(driveId));
  });

  test('a full drive refuses new RSVPs (409); a cancellation frees the spot', async () => {
    assert.equal((await api.post(`/drives/${driveId}/rsvp`, undefined, d.oNeg.token)).status, 409);
    assert.equal((await api.del(`/drives/${driveId}/rsvp`, d.bPos.token)).body.rsvpCount, 0);
    assert.equal((await api.post(`/drives/${driveId}/rsvp`, undefined, d.oNeg.token)).status, 201);
  });

  test('past drives drop off the list and cannot be RSVP\'d', async () => {
    const old = await prisma.drive.create({ data: { title: 'Old', organizer: 'X', venue: 'X', area: 'X', latitude: BASE.lat, longitude: BASE.lng, startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000), createdBy: { connect: { email: email('coord') } } } });
    assert.ok(!((await api.get('/drives')).body as any[]).some((x) => x.id === old.id));
    assert.equal((await api.post(`/drives/${old.id}/rsvp`, undefined, d.bPos.token)).status, 404);
  });
});

/* ------------------------------------------------------------------ */
describe('donor registry (coordinator)', () => {
  test('coordinator-only: donors get 403, anonymous gets 401', async () => {
    assert.equal((await api.get('/donors', d.bPos.token)).status, 403);
    assert.equal((await api.get('/donors/stats', d.bPos.token)).status, 403);
    assert.equal((await api.get('/donors')).status, 401);
  });

  test('list never exposes phone, email or exact location', async () => {
    const r = await api.get('/donors?q=bpos', coord);
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 1);
    const row = r.body.items[0];
    assert.equal(row.name, 'bpos');
    for (const k of ['phone', 'phoneEncrypted', 'email', 'latitude', 'longitude']) assert.equal(row[k], undefined, k);
  });

  test('status reflects eligibility, pause and the waiting period', async () => {
    const status = async (name: string) => (await api.get(`/donors?q=${name}`, coord)).body.items[0].status;
    assert.equal(await status('bpos'), 'eligible');
    assert.equal(await status('paused'), 'paused');
    assert.equal(await status('recent'), 'resting'); // donated 10 days ago, > 14 days still to go
  });

  test('first-timers are flagged; filters by group and status work', async () => {
    assert.equal((await api.get('/donors?q=oneg', coord)).body.items[0].firstTimer, true);
    const paused = (await api.get('/donors?status=paused&q=paused', coord)).body;
    assert.equal(paused.total, 1);
    const aPos = (await api.get('/donors?group=A_POSITIVE&q=apos', coord)).body;
    assert.equal(aPos.items[0].bloodGroup, 'A_POSITIVE');
    assert.equal((await api.get('/donors?group=O_NEGATIVE&q=apos', coord)).body.total, 0);
  });

  test('pagination and invalid filters', async () => {
    const page = (await api.get('/donors?pageSize=5&page=1', coord)).body;
    assert.ok(page.items.length <= 5 && page.total >= page.items.length);
    assert.equal((await api.get('/donors?status=whatever', coord)).status, 400);
    assert.equal((await api.get('/donors?pageSize=1000', coord)).status, 400);
  });

  test('stats add up: every blood group listed, group totals equal the overall total', async () => {
    const s = (await api.get('/donors/stats', coord)).body;
    assert.equal(s.byGroup.length, 8);
    assert.equal(s.byGroup.reduce((n: number, g: any) => n + g.total, 0), s.total);
    assert.ok(s.eligibleNow <= s.total && s.byGroup.every((g: any) => g.eligible <= g.total));
  });

  test('deactivating a donor blocks login and matching; reactivating restores both', async () => {
    const donor = await makeDonor(api, { name: 'spam', group: 'B_POSITIVE', kmNorth: 1.2 });
    const id = await verified();
    const loginOk = () => api.post('/auth/login', { email: email('spam'), password: 'Donor-Test-12345' });
    const r = await api.patch(`/donors/${donor.id}/active`, { active: false }, coord);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'inactive');
    assert.equal((await loginOk()).status, 401);
    assert.ok(!(await matchIds(id)).some((m) => m.donorId === donor.id));
    await api.patch(`/donors/${donor.id}/active`, { active: true }, coord);
    assert.equal((await loginOk()).status, 201);
    assert.ok((await matchIds(id)).some((m) => m.donorId === donor.id));
  });

  test('deactivate: unknown donor 404, missing flag 400, donors cannot do it', async () => {
    assert.equal((await api.patch('/donors/999999/active', { active: false }, coord)).status, 404);
    assert.equal((await api.patch(`/donors/${d.aPos.id}/active`, {}, coord)).status, 400);
    assert.equal((await api.patch(`/donors/${d.aPos.id}/active`, { active: false }, d.bPos.token)).status, 403);
  });
});

/* ------------------------------------------------------------------ */
describe('review fixes (regressions)', () => {
  test('#2 a donor who does not match cannot be added to outreach (would expose contact without the log)', async () => {
    const id = await verified(); // B+
    const donationsBefore = ((await api.get('/donors/me/donations', d.aPos.token)).body as any[]).length;
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${d.aPos.id}`, { status: 'CALLED' }, coord)).status, 404); // A+ can't give to B+
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${d.paused.id}`, { status: 'DONATED' }, coord)).status, 404);
    assert.ok(!(await outreachOf(id)).some((o) => o.donorId === d.aPos.id));
    assert.equal(((await api.get('/donors/me/donations', d.aPos.token)).body as any[]).length, donationsBefore); // no fake donation written
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${d.bPos.id}`, { status: 'CALLED' }, coord)).status, 200); // real matches still fine
  });

  test('#3 a deactivated account loses access immediately, even with a valid token', async () => {
    const donor = await makeDonor(api, { name: 'gone', group: 'B_POSITIVE', kmNorth: 1.1 });
    const id = await verified();
    await api.patch(`/donors/${donor.id}/active`, { active: false }, coord);
    assert.equal((await api.get('/donors/me', donor.token)).status, 401);
    assert.equal((await api.post(`/blood-requests/${id}/respond`, undefined, donor.token)).status, 401);
    assert.equal((await api.post('/donors/me/donations', { donatedAt: new Date().toISOString() }, donor.token)).status, 401);
    await api.patch(`/donors/${donor.id}/active`, { active: true }, coord);
    assert.equal((await api.get('/donors/me', donor.token)).status, 200);
  });

  test('#6 donors cannot erase a coordinator-recorded donation', async () => {
    const donor = await makeDonor(api, { name: 'eraser', group: 'O_NEGATIVE', kmNorth: 0.9 });
    const id = await verified({ units: 2 });
    await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'DONATED' }, coord);
    await api.patch('/donors/me', { lastDonationAt: null }, donor.token); // field is no longer accepted → ignored
    assert.equal((await api.get('/donors/me/eligibility', donor.token)).body.eligible, false);
    const [donation] = (await api.get('/donors/me/donations', donor.token)).body as any[];
    assert.equal((await api.del(`/donors/me/donations/${donation.id}`, donor.token)).status, 409);
  });

  test('#7 simultaneous RSVPs never overbook a drive', async () => {
    const drive = (await api.post('/drives', { title: 'Race', organizer: 'Test Org', venue: 'Test Hall', area: 'Test Area', ...at(1), startsAt: hoursAhead(24), endsAt: hoursAhead(30), capacity: 1 }, coord)).body;
    const racers = await Promise.all([1, 2, 3, 4, 5].map((n) => makeDonor(api, { name: `racer${n}`, group: 'O_POSITIVE', kmNorth: 5 + n / 10 })));
    const codes = (await Promise.all(racers.map((r) => api.post(`/drives/${drive.id}/rsvp`, undefined, r.token)))).map((r) => r.status).sort();
    assert.deepEqual(codes, [201, 409, 409, 409, 409]);
    assert.equal(await prisma.driveRsvp.count({ where: { driveId: drive.id } }), 1);
  });

  test('#8 blank names/areas and future donation dates are rejected; community can be changed and is tidied', async () => {
    const base = { password: 'Valid-Test-12345', bloodGroup: 'O_POSITIVE', phone: '+91 90000 44444', ...at(60) };
    assert.equal((await api.post('/auth/register', { ...base, email: email('blank'), displayName: '   ', area: 'Test' })).status, 400);
    assert.equal((await api.post('/auth/register', { ...base, email: email('blank2'), displayName: 'Ok Name', area: '   ' })).status, 400);
    assert.equal((await api.post('/auth/register', { ...base, email: email('future'), displayName: 'Future', area: 'Test', lastDonationAt: hoursAhead(24 * 365) })).status, 400);
    assert.equal((await api.patch('/donors/me', { displayName: '  ' }, d.bPos.token)).status, 400);
    const r = await api.patch('/donors/me', { community: '  COEP   Pune ' }, d.bPos.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.community, 'COEP Pune');
  });

  test('#9 undoing a DONATED that closed the request reopens it', async () => {
    const donor = await makeDonor(api, { name: 'misclick', group: 'O_NEGATIVE', kmNorth: 0.8 });
    const id = await verified({ units: 1 });
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'DONATED' }, coord)).body.status, 'FULFILLED');
    const undo = await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'COMING' }, coord);
    assert.equal(undo.status, 200);
    assert.equal(undo.body.status, 'OPEN');
    assert.equal((await api.get('/donors/me/eligibility', donor.token)).body.eligible, true);
  });

  test('#9 nobody new can be added to a fulfilled request', async () => {
    const donor = await makeDonor(api, { name: 'late', group: 'O_NEGATIVE', kmNorth: 0.7 });
    const id = await verified({ units: 1 });
    await api.post(`/blood-requests/${id}/fulfill`, undefined, coord);
    assert.equal((await api.put(`/blood-requests/${id}/outreach/${donor.id}`, { status: 'CALLED' }, coord)).status, 400);
  });

  test('#11 new requests: expiry capped at 7 days, blank hospital rejected', async () => {
    assert.equal((await newRequest({ expiresAt: hoursAhead(24 * 8) })).status, 400);
    assert.equal((await newRequest({ hospitalName: '   ' })).status, 400);
  });

  test('#12 impact counts requests that expired even if nobody opened the list', async () => {
    const id = await verified();
    await prisma.bloodRequest.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60000) } });
    assert.equal((await api.get('/blood-requests/impact')).status, 200);
    assert.equal((await prisma.bloodRequest.findUniqueOrThrow({ where: { id } })).status, 'EXPIRED');
  });
});

/* ------------------------------------------------------------------ */
describe('one donor, several requests (commitment)', () => {
  const statusAt = async (reqId: number, donorId: number) => (await outreachOf(reqId)).find((o) => o.donorId === donorId)?.status;

  test('hands on 3 requests → marked COMING at one: the other two are released as UNAVAILABLE', async () => {
    const donor = await makeDonor(api, { name: 'multi', group: 'O_NEGATIVE', kmNorth: 0.6 });
    const [a, b, c] = [await verified(), await verified(), await verified()];
    for (const r of [a, b, c]) assert.equal((await api.post(`/blood-requests/${r}/respond`, undefined, donor.token)).status, 201);
    assert.equal((await api.put(`/blood-requests/${a}/outreach/${donor.id}`, { status: 'COMING' }, coord)).status, 200);
    assert.equal(await statusAt(b, donor.id), 'UNAVAILABLE');
    assert.equal(await statusAt(c, donor.id), 'UNAVAILABLE');
    assert.equal((await api.get(`/blood-requests/${b}`)).body.responded, 0); // no longer counted as a raised hand
    const mine = (await api.get('/blood-requests/responses/me', donor.token)).body as any[];
    assert.deepEqual(mine.filter((m) => [a, b, c].includes(m.requestId)).map((m) => m.status).sort(), ['COMING', 'UNAVAILABLE', 'UNAVAILABLE']);
  });

  test('while COMING elsewhere: no new hands (409), no double booking (409), hidden from other matches', async () => {
    const donor = await makeDonor(api, { name: 'booked', group: 'O_NEGATIVE', kmNorth: 0.65 });
    const [a, b] = [await verified(), await verified()];
    await api.post(`/blood-requests/${a}/respond`, undefined, donor.token);
    await api.put(`/blood-requests/${a}/outreach/${donor.id}`, { status: 'COMING' }, coord);
    const hand = await api.post(`/blood-requests/${b}/respond`, undefined, donor.token);
    assert.equal(hand.status, 409);
    assert.match(hand.body.message, /RQ-\d{4}/);
    assert.equal((await api.put(`/blood-requests/${b}/outreach/${donor.id}`, { status: 'COMING' }, coord)).status, 409);
    assert.ok(!(await matchIds(b)).some((m) => m.donorId === donor.id));
  });

  test('DONATED at one request also releases a COMING at another', async () => {
    const donor = await makeDonor(api, { name: 'gave', group: 'O_NEGATIVE', kmNorth: 0.7 });
    const [x, y] = [await verified({ units: 2 }), await verified({ units: 2 })];
    await api.put(`/blood-requests/${y}/outreach/${donor.id}`, { status: 'COMING' }, coord); // expected at y…
    assert.equal((await api.put(`/blood-requests/${x}/outreach/${donor.id}`, { status: 'DONATED' }, coord)).status, 200); // …but gave at x
    assert.equal(await statusAt(y, donor.id), 'UNAVAILABLE');
    assert.equal((await api.get(`/blood-requests/${y}`)).body.coming, 0);
    assert.equal((await api.post(`/blood-requests/${y}/respond`, undefined, donor.token)).status, 400); // just donated → not eligible
  });

  test('undoing the commitment frees the donor; released hands are not restored but can be raised again', async () => {
    const donor = await makeDonor(api, { name: 'undo2', group: 'O_NEGATIVE', kmNorth: 0.75 });
    const [a, b] = [await verified(), await verified()];
    await api.post(`/blood-requests/${b}/respond`, undefined, donor.token);
    await api.put(`/blood-requests/${a}/outreach/${donor.id}`, { status: 'COMING' }, coord);
    assert.equal(await statusAt(b, donor.id), 'UNAVAILABLE');
    await api.put(`/blood-requests/${a}/outreach/${donor.id}`, { status: 'DECLINED' }, coord);
    assert.equal(await statusAt(b, donor.id), 'UNAVAILABLE'); // not silently restored
    assert.ok((await matchIds(b)).some((m) => m.donorId === donor.id)); // matchable again
    assert.equal((await api.post(`/blood-requests/${b}/respond`, undefined, donor.token)).status, 201);
    assert.equal(await statusAt(b, donor.id), 'RESPONDED');
  });

  test('only live requests are released: closed requests keep their history', async () => {
    const donor = await makeDonor(api, { name: 'history', group: 'O_NEGATIVE', kmNorth: 0.85 });
    const [old, now] = [await verified(), await verified()];
    await api.put(`/blood-requests/${old}/outreach/${donor.id}`, { status: 'CALLED' }, coord);
    await api.post(`/blood-requests/${old}/cancel`, undefined, coord);
    await api.put(`/blood-requests/${now}/outreach/${donor.id}`, { status: 'COMING' }, coord);
    assert.equal(await statusAt(old, donor.id), 'CALLED');
  });
});
