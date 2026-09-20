-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "outputRequired" TEXT;
ALTER TABLE "Lead" ADD COLUMN "submissionDeadline" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "outputCompletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_submissionDeadline_idx" ON "Lead"("submissionDeadline");
CREATE INDEX "Lead_outputRequired_idx" ON "Lead"("outputRequired");
