-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('CALLED', 'NO_ANSWER', 'COMING', 'DECLINED', 'DONATED');

-- CreateTable
CREATE TABLE "Outreach" (
    "requestId" INTEGER NOT NULL,
    "donorId" INTEGER NOT NULL,
    "status" "OutreachStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outreach_pkey" PRIMARY KEY ("requestId","donorId")
);

-- AddForeignKey
ALTER TABLE "Outreach" ADD CONSTRAINT "Outreach_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BloodRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outreach" ADD CONSTRAINT "Outreach_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

