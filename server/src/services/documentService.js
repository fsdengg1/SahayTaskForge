const path = require('path');
const { prisma } = require('../prisma');
const { nextNumber } = require('../utils/numbering');
const { parsePagination, paginated } = require('../utils/pagination');
const { AppError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');
const { notifyByPermission } = require('../utils/notifications');

async function createDocumentFromFile({ file, leadId, projectId, issueId, categoryCode, userId, revision }) {
  if (!file) throw new AppError(400, 'A file is required.');
  if (leadId) {
    const existingLeads = require('./existingLeadStore');
    if (await existingLeads.exists(leadId)) {
      const doc = await existingLeads.addDocument(leadId, file, categoryCode, userId);
      await logActivity({
        userId,
        action: 'DOCUMENT_UPLOADED',
        entity: 'Lead',
        entityId: leadId,
        description: `${doc.originalName} uploaded`,
      });
      return doc;
    }
  }
  const documentId = await nextNumber('DOC');
  const rel = path.relative(process.cwd(), file.path).replace(/\\/g, '/');
  const doc = await prisma.document.create({
    data: {
      documentId,
      leadId: leadId || null,
      projectId: projectId || null,
      issueId: issueId || null,
      categoryCode: categoryCode || 'OTHER',
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: rel,
      revision: revision || 'R0',
      uploadedById: userId || null,
    },
  });
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      revision: doc.revision,
      fileName: file.filename,
      storagePath: rel,
      uploadedById: userId || null,
    },
  });
  await logActivity({
    userId,
    action: 'DOCUMENT_UPLOADED',
    entity: leadId ? 'Lead' : 'Project',
    entityId: leadId || projectId,
    description: `${doc.originalName} uploaded as ${doc.documentId}`,
  });
  if (leadId) {
    const { maybeCompleteLeadOutput } = require('./leadService');
    await maybeCompleteLeadOutput(leadId, userId);
  }
  return doc;
}

async function listDocuments(query) {
  const { skip, take, page, pageSize } = parsePagination(query);
  const where = {
    archived: query.archived === 'true',
    ...(query.q
      ? {
          OR: [
            { documentId: { contains: query.q, mode: 'insensitive' } },
            { originalName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.category ? { categoryCode: query.category } : {}),
    ...(query.categories ? { categoryCode: { in: String(query.categories).split(',').filter(Boolean) } } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.leadId ? { leadId: query.leadId } : {}),
    ...(query.issueId ? { issueId: query.issueId } : {}),
    ...(query.revision ? { revision: { contains: query.revision, mode: 'insensitive' } } : {}),
    ...(query.customerId
      ? {
          OR: [
            { project: { customerId: query.customerId } },
            { lead: { customerId: query.customerId } },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          uploadedAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
        project: { select: { id: true, projectId: true, name: true, customer: { select: { companyName: true } } } },
        lead: { select: { id: true, leadId: true, customer: { select: { companyName: true } } } },
        versions: { orderBy: { uploadedAt: 'desc' } },
      },
      skip,
      take,
      orderBy: { uploadedAt: 'desc' },
    }),
    prisma.document.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function archiveDocument(id, user) {
  const doc = await prisma.document.update({ where: { id }, data: { archived: true } });
  await logActivity({
    userId: user.id,
    action: 'DOCUMENT_ARCHIVED',
    entity: 'Document',
    entityId: id,
    description: `${doc.documentId} archived`,
  });
  return doc;
}

async function submitApproval(data, user) {
  const approval = await prisma.approval.create({
    data: {
      documentId: data.documentId || null,
      projectId: data.projectId || null,
      revision: data.revision || null,
      submittedById: user.id,
      reviewerId: data.reviewerId || null,
      statusCode: 'PENDING_REVIEW',
      comments: data.comments || null,
    },
  });
  if (data.documentId) {
    await prisma.document.update({ where: { id: data.documentId }, data: { approvalStatus: 'PENDING_REVIEW' } });
  }
  await logActivity({
    userId: user.id,
    action: 'APPROVAL_SUBMITTED',
    entity: 'Approval',
    entityId: approval.id,
    description: 'Document submitted for review',
  });
  if (data.reviewerId) {
    await notifyByPermission('design.edit', {
      title: 'Approval pending',
      message: 'A document is waiting for review',
      type: 'APPROVAL',
      entityType: 'Approval',
      entityId: approval.id,
      link: data.projectId ? `/projects/${data.projectId}` : '/documents',
    });
  }
  return approval;
}

async function decideApproval(id, statusCode, comments, user) {
  const existing = await prisma.approval.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Approval not found.');
  const approval = await prisma.approval.update({
    where: { id },
    data: {
      statusCode,
      comments,
      reviewerId: user.id,
      approvedAt: statusCode === 'APPROVED' ? new Date() : null,
    },
  });
  if (existing.documentId) {
    await prisma.document.update({
      where: { id: existing.documentId },
      data: { approvalStatus: statusCode },
    });
  }
  await logActivity({
    userId: user.id,
    action: statusCode === 'APPROVED' ? 'DRAWING_APPROVED' : 'APPROVAL_DECIDED',
    entity: 'Approval',
    entityId: id,
    oldValue: existing.statusCode,
    newValue: statusCode,
    description: comments || `Approval ${statusCode}`,
  });
  if (statusCode === 'REJECTED' || statusCode === 'REVISION_REQUIRED') {
    if (existing.projectId) {
      const { createTask } = require('./taskService');
      await createTask({
        projectId: existing.projectId,
        name: 'Revise drawing / BOQ and resubmit',
        module: 'DESIGN',
        statusCode: 'NOT_STARTED',
        priorityCode: 'HIGH',
        remarks: comments || 'Revision required after review',
      }, user);
    }
  }
  return approval;
}

module.exports = {
  createDocumentFromFile,
  listDocuments,
  archiveDocument,
  submitApproval,
  decideApproval,
};
