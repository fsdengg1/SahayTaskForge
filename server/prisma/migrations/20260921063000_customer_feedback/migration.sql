-- Customer Feedback is an additional Pre-Sales workflow. Existing leads are not modified.

CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "leadId" UUID NOT NULL,
    "location" TEXT,
    "layoutSentDate" TIMESTAMP(3),
    "quotationSentDate" TIMESTAMP(3),
    "drawingQuoteStatus" TEXT,
    "feedbackStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "customerFeedback" TEXT,
    "feedbackDate" TIMESTAMP(3),
    "pendingRequirement" TEXT,
    "nextAction" TEXT,
    "responsiblePersonId" TEXT,
    "nextFollowUpDate" TIMESTAMP(3),
    "finalStatus" TEXT NOT NULL DEFAULT 'FOLLOW_UP_REQUIRED',
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerFeedback_leadId_key" ON "CustomerFeedback"("leadId");
CREATE INDEX "CustomerFeedback_feedbackStatus_idx" ON "CustomerFeedback"("feedbackStatus");
CREATE INDEX "CustomerFeedback_finalStatus_idx" ON "CustomerFeedback"("finalStatus");
CREATE INDEX "CustomerFeedback_responsiblePersonId_idx" ON "CustomerFeedback"("responsiblePersonId");
CREATE INDEX "CustomerFeedback_nextFollowUpDate_idx" ON "CustomerFeedback"("nextFollowUpDate");

CREATE TABLE "CustomerFeedbackEvent" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "customerFeedback" TEXT,
    "nextAction" TEXT,
    "remarks" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerFeedbackEvent_feedbackId_createdAt_idx" ON "CustomerFeedbackEvent"("feedbackId", "createdAt");

ALTER TABLE "CustomerFeedback"
  ADD CONSTRAINT "CustomerFeedback_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerFeedback"
  ADD CONSTRAINT "CustomerFeedback_responsiblePersonId_fkey"
  FOREIGN KEY ("responsiblePersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerFeedback"
  ADD CONSTRAINT "CustomerFeedback_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerFeedbackEvent"
  ADD CONSTRAINT "CustomerFeedbackEvent_feedbackId_fkey"
  FOREIGN KEY ("feedbackId") REFERENCES "CustomerFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerFeedbackEvent"
  ADD CONSTRAINT "CustomerFeedbackEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "name", "module")
VALUES
  (gen_random_uuid(), 'customer_feedback.view', 'View customer feedback', 'customer_feedback'),
  (gen_random_uuid(), 'customer_feedback.create', 'Create customer feedback', 'customer_feedback'),
  (gen_random_uuid(), 'customer_feedback.edit', 'Edit customer feedback', 'customer_feedback')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'FEEDBACK_STATUS', 'PENDING', 'Pending', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_STATUS', 'RECEIVED', 'Received', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_STATUS', 'NO_RESPONSE', 'No Response', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_STATUS', 'NOT_FEASIBLE', 'Not Feasible', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_STATUS', 'CLARIFICATION_REQUIRED', 'Clarification Required', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DRAWING_QUOTE_STATUS', 'PENDING', 'Pending', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DRAWING_QUOTE_STATUS', 'SENT', 'Sent', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DRAWING_QUOTE_STATUS', 'REVISION_REQUIRED', 'Revision Required', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DRAWING_QUOTE_STATUS', 'APPROVED', 'Approved', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DRAWING_QUOTE_STATUS', 'ON_HOLD', 'On Hold', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'FOLLOW_UP_REQUIRED', 'Follow-up Required', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'CUSTOMER_CONFIRMATION_PENDING', 'Customer Confirmation Pending', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'AWAITING_CUSTOMER_RESPONSE', 'Awaiting Customer Response', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'FEEDBACK_RECEIVED', 'Feedback Received', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'QUOTATION_REVISION_REQUIRED', 'Quotation Revision Required', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'LAYOUT_REVISION_REQUIRED', 'Layout Revision Required', 6, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'REQUIREMENT_PENDING', 'Requirement Pending', 7, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'NOT_FEASIBLE', 'Not Feasible', 8, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FEEDBACK_FINAL_STATUS', 'CLOSED', 'Closed', 9, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
