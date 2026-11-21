import { BloodGroup } from '@prisma/client';

const donorsByRecipient: Record<BloodGroup, BloodGroup[]> = {
  A_POSITIVE: ['A_POSITIVE', 'A_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'],
  A_NEGATIVE: ['A_NEGATIVE', 'O_NEGATIVE'],
  B_POSITIVE: ['B_POSITIVE', 'B_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'],
  B_NEGATIVE: ['B_NEGATIVE', 'O_NEGATIVE'],
  AB_POSITIVE: ['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'],
  AB_NEGATIVE: ['A_NEGATIVE', 'B_NEGATIVE', 'AB_NEGATIVE', 'O_NEGATIVE'],
  O_POSITIVE: ['O_POSITIVE', 'O_NEGATIVE'],
  O_NEGATIVE: ['O_NEGATIVE'],
};

export function compatibleDonorGroups(recipient: BloodGroup): BloodGroup[] { return donorsByRecipient[recipient]; }
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(bLat - aLat), dLon = radians(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const DONATION_WAIT_DAYS = 56;
export function eligible(lastDonationAt: Date | null, now = new Date()): boolean {
  // No recorded donation = first-time donor, who is eligible (subject to the usual medical screening at the camp).
  return !lastDonationAt || now.getTime() - lastDonationAt.getTime() >= DONATION_WAIT_DAYS * 86400000;
}
