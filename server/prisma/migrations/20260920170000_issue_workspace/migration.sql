-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "issueNumber" TEXT;
ALTER TABLE "Issue" ADD COLUMN "issueType" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Issue" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Issue" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Issue" ADD COLUMN "isBlocking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Issue" ADD COLUMN "blockedDepartmentId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "requiredAction" TEXT;
ALTER TABLE "Issue" ADD COLUMN "actionOwnerId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "targetDate" TIMESTAMP(3);
ALTER TABLE "Issue" ADD COLUMN "impactNotes" TEXT;
ALTER TABLE "Issue" ADD COLUMN "estimatedDelayDays" INTEGER;
ALTER TABLE "Issue" ADD COLUMN "resolutionNotes" TEXT;
ALTER TABLE "Issue" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Issue" i
SET "issueNumber" = t.num
FROM (
  SELECT id, 'ISSUE-' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt")::text, 3, '0') AS num
  FROM "Issue"
) t
WHERE i.id = t.id;

ALTER TABLE "Issue" ALTER COLUMN "issueNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Issue_issueNumber_key" ON "Issue"("issueNumber");
CREATE INDEX "Issue_projectId_idx" ON "Issue"("projectId");
CREATE INDEX "Issue_statusCode_idx" ON "Issue"("statusCode");
CREATE INDEX "Issue_priorityCode_idx" ON "Issue"("priorityCode");
CREATE INDEX "Issue_departmentId_idx" ON "Issue"("departmentId");
CREATE INDEX "Issue_assignedToId_idx" ON "Issue"("assignedToId");
CREATE INDEX "Issue_dueDate_idx" ON "Issue"("dueDate");

ALTER TABLE "Issue" ADD CONSTRAINT "Issue_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_blockedDepartmentId_fkey" FOREIGN KEY ("blockedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_actionOwnerId_fkey" FOREIGN KEY ("actionOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD COLUMN "issueId" TEXT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "NumberSequence" ("id", "key", "prefix", "padLength", "current")
SELECT gen_random_uuid(), 'ISSUE', 'ISSUE-', 3, COALESCE((SELECT COUNT(*) FROM "Issue"), 0)
WHERE NOT EXISTS (SELECT 1 FROM "NumberSequence" WHERE "key" = 'ISSUE');

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'ISSUE_STATUS', 'OPEN', 'Open', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_STATUS', 'IN_PROGRESS', 'In Progress', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_STATUS', 'BLOCKED', 'Blocked', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_STATUS', 'ON_HOLD', 'On Hold', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_STATUS', 'RESOLVED', 'Resolved', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_STATUS', 'CLOSED', 'Closed', 6, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'DESIGN', 'Design', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'PROCUREMENT', 'Procurement', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'MATERIAL', 'Material', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'PRODUCTION', 'Production', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'QUALITY', 'Quality', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'STORES', 'Stores', 6, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'LOGISTICS', 'Logistics', 7, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'INSTALLATION', 'Installation', 8, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'CUSTOMER', 'Customer', 9, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'COMMERCIAL', 'Commercial', 10, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'DEPENDENCY', 'Dependency', 11, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISSUE_TYPE', 'OTHER', 'Other', 12, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
