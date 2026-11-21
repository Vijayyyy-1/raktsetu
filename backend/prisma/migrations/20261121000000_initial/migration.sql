CREATE TYPE "UserRole" AS ENUM ('DONOR', 'COORDINATOR');
CREATE TYPE "BloodGroup" AS ENUM ('A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE');
CREATE TYPE "RequestUrgency" AS ENUM ('ROUTINE', 'URGENT', 'CRITICAL');
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'DONOR',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

CREATE TABLE "Donor" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "bloodGroup" "BloodGroup" NOT NULL,
  "phoneEncrypted" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "lastDonationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Donor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Donor_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Donor_accountId_key" ON "Donor"("accountId");
CREATE INDEX "Donor_bloodGroup_available_idx" ON "Donor"("bloodGroup", "available");

CREATE TABLE "BloodRequest" (
  "id" TEXT NOT NULL,
  "bloodGroup" "BloodGroup" NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "hospitalName" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "urgency" "RequestUrgency" NOT NULL DEFAULT 'URGENT',
  "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BloodRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BloodRequest_status_expiresAt_bloodGroup_idx" ON "BloodRequest"("status", "expiresAt", "bloodGroup");
