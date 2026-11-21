-- AlterTable
ALTER TABLE "Donation" ADD COLUMN     "requestId" INTEGER;

-- CreateIndex
CREATE INDEX "Donation_donorId_requestId_idx" ON "Donation"("donorId", "requestId");

