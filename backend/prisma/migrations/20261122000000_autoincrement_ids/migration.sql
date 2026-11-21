-- Convert prototype IDs from CUID strings to PostgreSQL-backed integers while
-- preserving the seeded rows and their relationships.
ALTER TABLE "Account" ADD COLUMN "id_new" SERIAL NOT NULL;
ALTER TABLE "Donor" ADD COLUMN "id_new" SERIAL NOT NULL;
ALTER TABLE "Donor" ADD COLUMN "accountId_new" INTEGER;
UPDATE "Donor" d SET "accountId_new" = a."id_new"
FROM "Account" a WHERE a."id" = d."accountId";
ALTER TABLE "Donor" ALTER COLUMN "accountId_new" SET NOT NULL;

ALTER TABLE "BloodRequest" ADD COLUMN "id_new" SERIAL NOT NULL;
ALTER TABLE "BloodRequest" ADD COLUMN "createdById_new" INTEGER;
ALTER TABLE "BloodRequest" ADD COLUMN "verifiedById_new" INTEGER;
UPDATE "BloodRequest" r SET "createdById_new" = a."id_new"
FROM "Account" a WHERE a."id" = r."createdById";
UPDATE "BloodRequest" r SET "verifiedById_new" = a."id_new"
FROM "Account" a WHERE a."id" = r."verifiedById";
ALTER TABLE "BloodRequest" ALTER COLUMN "createdById_new" SET NOT NULL;

DROP INDEX "Donor_accountId_key";
ALTER TABLE "Donor" DROP CONSTRAINT "Donor_accountId_fkey";
ALTER TABLE "Donor" DROP CONSTRAINT "Donor_pkey";
ALTER TABLE "BloodRequest" DROP CONSTRAINT "BloodRequest_pkey";
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey";

ALTER TABLE "Donor" DROP COLUMN "id";
ALTER TABLE "Donor" DROP COLUMN "accountId";
ALTER TABLE "Donor" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "Donor" RENAME COLUMN "accountId_new" TO "accountId";

ALTER TABLE "BloodRequest" DROP COLUMN "id";
ALTER TABLE "BloodRequest" DROP COLUMN "createdById";
ALTER TABLE "BloodRequest" DROP COLUMN "verifiedById";
ALTER TABLE "BloodRequest" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "BloodRequest" RENAME COLUMN "createdById_new" TO "createdById";
ALTER TABLE "BloodRequest" RENAME COLUMN "verifiedById_new" TO "verifiedById";

ALTER TABLE "Account" DROP COLUMN "id";
ALTER TABLE "Account" RENAME COLUMN "id_new" TO "id";

ALTER TABLE "Account" ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_pkey" PRIMARY KEY ("id");
ALTER TABLE "BloodRequest" ADD CONSTRAINT "BloodRequest_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "Donor_accountId_key" ON "Donor"("accountId");
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BloodRequest" ADD CONSTRAINT "BloodRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BloodRequest" ADD CONSTRAINT "BloodRequest_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
