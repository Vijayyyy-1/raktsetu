-- CreateTable
CREATE TABLE "Drive" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Drive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveRsvp" (
    "driveId" INTEGER NOT NULL,
    "donorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveRsvp_pkey" PRIMARY KEY ("driveId","donorId")
);

-- CreateIndex
CREATE INDEX "Drive_endsAt_startsAt_idx" ON "Drive"("endsAt", "startsAt");

-- AddForeignKey
ALTER TABLE "Drive" ADD CONSTRAINT "Drive_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveRsvp" ADD CONSTRAINT "DriveRsvp_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveRsvp" ADD CONSTRAINT "DriveRsvp_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

