-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "outputStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "outputCompletedById" TEXT;
ALTER TABLE "Lead" ADD COLUMN "outputDelayDays" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "outputOnHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "holdReason" TEXT;
ALTER TABLE "Lead" ADD COLUMN "holdStartedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "holdEndedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_outputCompletedById_fkey" FOREIGN KEY ("outputCompletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
