import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BloodGroup } from '@prisma/client';
import { compatibleDonorGroups, DONATION_WAIT_DAYS, distanceKm, eligible } from '../src/common/matching';

const ALL = Object.values(BloodGroup);
const DAY = 86400000;

describe('blood group compatibility (red cells)', () => {
  test('O− can give to every group (universal donor)', () => {
    for (const recipient of ALL) assert.ok(compatibleDonorGroups(recipient).includes('O_NEGATIVE'), recipient);
  });

  test('AB+ can receive from every group (universal recipient)', () => {
    assert.deepEqual([...compatibleDonorGroups('AB_POSITIVE')].sort(), [...ALL].sort());
  });

  test('every group can receive its own group', () => {
    for (const g of ALL) assert.ok(compatibleDonorGroups(g).includes(g), g);
  });

  test('Rh-negative recipients never receive Rh-positive blood', () => {
    for (const g of ALL.filter((x) => x.endsWith('NEGATIVE'))) {
      assert.ok(compatibleDonorGroups(g).every((d) => d.endsWith('NEGATIVE')), g);
    }
  });

  test('B+ receives exactly B+, B−, O+, O− (the 2.2 problem-statement case)', () => {
    assert.deepEqual([...compatibleDonorGroups('B_POSITIVE')].sort(), ['B_NEGATIVE', 'B_POSITIVE', 'O_NEGATIVE', 'O_POSITIVE']);
  });

  test('A and B never cross', () => {
    assert.ok(!compatibleDonorGroups('A_POSITIVE').some((d) => d.startsWith('B')));
    assert.ok(!compatibleDonorGroups('B_POSITIVE').some((d) => d.startsWith('A')));
  });
});

describe('eligibility estimate', () => {
  const now = new Date('2026-11-21T12:00:00Z');

  test('first-time donor (no recorded donation) is eligible', () => {
    assert.equal(eligible(null, now), true);
  });

  test('eligible exactly at the waiting interval', () => {
    assert.equal(eligible(new Date(now.getTime() - DONATION_WAIT_DAYS * DAY), now), true);
  });

  test('not eligible one day before the interval ends', () => {
    assert.equal(eligible(new Date(now.getTime() - (DONATION_WAIT_DAYS - 1) * DAY), now), false);
  });

  test('donated today → not eligible', () => {
    assert.equal(eligible(now, now), false);
  });
});

describe('distance', () => {
  test('same point is 0 km', () => {
    assert.equal(distanceKm(18.52, 73.86, 18.52, 73.86), 0);
  });

  test('Pune → Mumbai is about 120 km straight-line', () => {
    const km = distanceKm(18.5204, 73.8567, 19.076, 72.8777);
    assert.ok(km > 110 && km < 130, `got ${km}`);
  });

  test('symmetric', () => {
    assert.equal(distanceKm(18.5, 73.8, 18.6, 73.9), distanceKm(18.6, 73.9, 18.5, 73.8));
  });
});
