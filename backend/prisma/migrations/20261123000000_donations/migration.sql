-- Donation history; Donor.lastDonationAt stays as the cached latest entry.
CREATE TABLE "Donation" (
    "id" SERIAL NOT NULL,
    "donorId" INTEGER NOT NULL,
    "donatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Donation_donorId_donatedAt_key" ON "Donation"("donorId", "donatedAt");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill so existing donors keep the one date we already know.
INSERT INTO "Donation" ("donorId", "donatedAt") SELECT "id", "lastDonationAt" FROM "Donor" WHERE "lastDonationAt" IS NOT NULL;
