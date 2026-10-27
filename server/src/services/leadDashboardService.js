const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const existingLeads = require('./existingLeadStore');
const stats = require('./leadStatistics');

const STATUS_ORDER = [
  'NEW',
  'FOLLOW_UP',
  'SUBMITTED',
  'APPROVED',
  'QUALIFICATION',
  'REQUIREMENT_REVIEW',
  'SITE_SURVEY_REQUIRED',
  'DESIGN_PENDING',
  'QUOTATION_PENDING',
  'QUOTATION_SENT',
  'CUSTOMER_FOLLOW_UP',
  'REVISION_REQUIRED',
  'NEGOTIATION',
  'ON_HOLD',
  'WON',
  'COMPLETED',
  'LOST',
];

const OUTPUT_ORDER = ['BOM_DRAWINGS', 'BOM', 'DRAWING', '__none'];
const PRIORITY_ORDER = ['CRITICAL', 'VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW'];
const DEADLINE_ORDER = ['ON_TIME', 'COMPLETED', 'DELAYED', 'OVERDUE', 'ON_HOLD'];

const DEADLINE_META = {
  ON_TIME: { label: 'IN PROGRESS', tone: 'green' },
  COMPLETED: { label: 'COMPLETED', tone: 'green' },
  DELAYED: { label: 'DELAYED', tone: 'brown' },
  OVERDUE: { label: 'OVERDUE', tone: 'red' },
  ON_HOLD: { label: 'ON HOLD', tone: 'yellow' },
};

const FEEDBACK_META = {
  PENDING: { label: 'Feedback Required / Pending', tone: 'orange' },
  RECEIVED: { label: 'Feedback Received', tone: 'green' },
  NOT_REQUIRED: { label: 'Not Required', tone: 'grey' },
};

function labelFromCode(code) {
  if (String(code || '').toUpperCase() === 'IN_PROGRESS') return 'LIVE';
  return String(code || 'Unknown')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isDelayed(lead) {
  return lead.outputStatus === 'DELAYED_1_3' || lead.outputStatus === 'DELAYED_OVER_3';
}

function isActive(lead) {
  return stats.isActiveLead(lead);
}

function isPending(lead) {
  return existingLeads.isPendingEnquiry(lead);
}

function feedbackBucket(feedback) {
  const code = feedback?.code || 'NOT_REQUIRED';
  if (code === 'RECEIVED' || code === 'FEEDBACK_RECEIVED') return 'RECEIVED';
  if (code === 'NOT_REQUIRED') return 'NOT_REQUIRED';
  return 'PENDING';
}

function deadlineGroup(lead) {
  if (lead.outputStatus === 'COMPLETED') return 'COMPLETED';
  if (lead.outputStatus === 'ON_HOLD') return 'ON_HOLD';
  if (lead.outputStatus === 'OVERDUE') return 'OVERDUE';
  if (isDelayed(lead)) return 'DELAYED';
  return 'ON_TIME';
}

function baseQuery(query) {
  const next = { ...query };
  delete next.feedback;
  delete next.scope;
  delete next.leadType;
  if (next.outputStatus === 'DELAYED') delete next.outputStatus;
  if (next.deadlineStatus === 'DELAYED') delete next.deadlineStatus;
  return next;
}

function matchesStatus(lead, query) {
  return !query.status || lead.statusCode === query.status;
}

function matchesLocation(lead, query) {
  if (!query.location) return true;
  if (query.location === '__pending') return Boolean(lead.locationPending);
  return String(lead.location || '').toLowerCase() === String(query.location).toLowerCase();
}

function applyDashboardFilters(leads, query) {
  return leads.filter((lead) => {
    if (query.leadType && canonicalType(lead.requirement?.requirementType) !== canonicalType(query.leadType)) return false;
    if (query.feedback && feedbackBucket(lead.customerFeedback) !== query.feedback) return false;
    if ((query.outputStatus === 'DELAYED' || query.deadlineStatus === 'DELAYED') && !isDelayed(lead)) return false;
    if (query.scope === 'active' && !stats.isActiveLead(lead)) return false;
    if (query.scope === 'pending' && !stats.isPendingFollowUp(lead)) return false;
    if (query.scope === 'delayed' && !stats.isDelayedLead(lead)) return false;
    if (query.scope === 'hold' && !stats.isOnHoldLead(lead)) return false;
    return true;
  });
}

function orderedCounts(map, order) {
  const items = [...map.values()];
  const rank = new Map(order.map((code, index) => [code, index]));
  return items
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      const ar = rank.has(a.code) ? rank.get(a.code) : order.length;
      const br = rank.has(b.code) ? rank.get(b.code) : order.length;
      if (ar !== br) return ar - br;
      return String(a.label).localeCompare(String(b.label));
    });
}

function bump(map, code, fields) {
  const current = map.get(code) || { code, count: 0, ...fields };
  current.count += 1;
  map.set(code, current);
}

function buildDashboard(leads, { includeCompletedDeadlines = false } = {}) {
  const statusMap = new Map();
  const outputMap = new Map();
  const priorityMap = new Map();
  const salesMap = new Map();
  const customerMap = new Map();
  const feedbackMap = new Map();
  const deadlineMap = new Map();

  let activeLeads = 0;
  let completedLeads = 0;
  let pendingLeads = 0;
  let overdueLeads = 0;
  let onTimeLeads = 0;
  let delayedLeads = 0;
  let onHoldLeads = 0;

  for (const lead of leads) {
    if (isActive(lead)) activeLeads += 1;
    if (lead.outputStatus === 'COMPLETED') completedLeads += 1;
    if (isPending(lead)) pendingLeads += 1;
    if (lead.outputStatus === 'OVERDUE') overdueLeads += 1;
    if (lead.outputStatus === 'ON_TIME') onTimeLeads += 1;
    if (isDelayed(lead)) delayedLeads += 1;
    if (lead.outputStatus === 'ON_HOLD') onHoldLeads += 1;

    const statusCode = lead.statusCode || 'UNKNOWN';
    bump(statusMap, statusCode, { label: labelFromCode(statusCode) });

    const outputCode = lead.outputRequired || '__none';
    bump(outputMap, outputCode, {
      label: outputCode === '__none' ? 'Not specified' : (lead.outputRequiredLabel || labelFromCode(outputCode)),
      tone: 'blue',
    });

    const priorityCode = lead.priorityCode || 'MEDIUM';
    bump(priorityMap, priorityCode, { label: labelFromCode(priorityCode) });

    const salesId = lead.salesPersonId || 'unassigned';
    bump(salesMap, salesId, {
      id: lead.salesPersonId || null,
      label: lead.salesPerson?.fullName || 'Unassigned',
      tone: 'blue',
      active: 0,
      completed: 0,
      pending: 0,
    });
    const salesRow = salesMap.get(salesId);
    if (stats.isActiveLead(lead)) salesRow.active += 1;
    if (stats.isCompletedLead(lead)) salesRow.completed += 1;
    if (stats.isPendingFollowUp(lead)) salesRow.pending += 1;

    const customerName = String(lead.customer?.companyName || '').trim() || 'Unknown customer';
    const customerKey = lead.customerId ? `id:${lead.customerId}` : `name:${customerName.toLowerCase()}`;
    bump(customerMap, customerKey, {
      customerId: lead.customerId || null,
      customerName,
      label: customerName,
      tone: 'blue',
    });

    const feedbackCode = feedbackBucket(lead.customerFeedback);
    bump(feedbackMap, feedbackCode, FEEDBACK_META[feedbackCode]);

    const track = deadlineGroup(lead);
    bump(deadlineMap, track, DEADLINE_META[track]);
  }

  const upcomingPool = leads
    .filter((lead) => lead.submissionDeadline && (includeCompletedDeadlines || lead.outputStatus !== 'COMPLETED'))
    .sort((a, b) => new Date(a.submissionDeadline) - new Date(b.submissionDeadline));

  return {
    totalLeads: leads.length,
    activeLeads,
    completedLeads,
    pendingLeads,
    overdueLeads,
    onTimeLeads,
    delayedLeads,
    onHoldLeads,
    statusDistribution: orderedCounts(statusMap, STATUS_ORDER),
    outputDistribution: orderedCounts(outputMap, OUTPUT_ORDER),
    deadlineDistribution: orderedCounts(deadlineMap, DEADLINE_ORDER),
    priorityDistribution: orderedCounts(priorityMap, PRIORITY_ORDER),
    salesPersonDistribution: [...salesMap.values()]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    customerDistribution: [...customerMap.values()]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    feedbackDistribution: orderedCounts(feedbackMap, ['PENDING', 'RECEIVED', 'NOT_REQUIRED']),
    upcomingDeadlines: upcomingPool.slice(0, 15).map((lead) => ({
      id: lead.id,
      leadId: lead.leadId,
      customer: lead.customer?.companyName || '—',
      location: lead.location || 'Location Pending',
      locationPending: Boolean(lead.locationPending),
      productGroup: lead.productGroup || '',
      output: lead.outputRequiredLabel || '—',
      salesPerson: lead.salesPerson?.fullName || '—',
      priorityCode: lead.priorityCode,
      statusCode: lead.statusCode,
      deadline: lead.submissionDeadline,
      track: lead.outputStatus,
      trackLabel: lead.outputStatusLabel,
      dueToday: lead.delayDays === 0 && lead.outputStatus !== 'COMPLETED' && lead.outputStatus !== 'ON_HOLD',
    })),
  };
}

function activityLabel(action, description = '') {
  const code = String(action || '').toUpperCase();
  const text = String(description || '').toUpperCase();
  if (code.includes('FEEDBACK') || code === 'FOLLOW_UP') return 'Feedback updated';
  if (code.includes('APPROV')) return 'Lead approved';
  if (code === 'OUTPUT_SUBMITTED') {
    return text.includes('COMPLETED') ? 'Lead completed' : 'Output submitted';
  }
  if (code.includes('STATUS')) return 'Status changed';
  if (code === 'LEAD_CREATED' || code === 'CREATED') return 'Lead created';
  if (code === 'LEAD_UPDATED' || code === 'UPDATED') return 'Lead updated';
  if (code.includes('COMPLET')) return 'Lead completed';
  if (code.includes('OUTPUT') || code.includes('SUBMIT')) return 'Output submitted';
  if (code.includes('CREAT')) return 'Lead created';
  if (code.includes('UPDAT')) return 'Lead updated';
  return labelFromCode(action || 'Activity');
}

function canonicalType(code) {
  return String(code || '').trim().toUpperCase();
}

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function recentActivity(leads) {
  const ids = leads.map((lead) => lead.id).filter(isUuid);
  const leadCodeById = new Map(leads.map((lead) => [lead.id, lead.leadId]));
  const events = [];

  if (ids.length) {
    try {
      const logs = await prisma.activityLog.findMany({
        where: { entity: 'Lead', entityId: { in: ids } },
        include: { user: { select: { fullName: true } } },
        orderBy: { timestamp: 'desc' },
        take: 40,
      });
      for (const log of logs) {
        events.push({
          id: log.id,
          label: activityLabel(log.action, log.description),
          description: log.description || activityLabel(log.action, ''),
          timestamp: log.timestamp,
          userName: log.user?.fullName || null,
          leadRecordId: log.entityId,
          leadCode: leadCodeById.get(log.entityId) || null,
        });
      }
    } catch {
      // Activity log is optional for older databases.
    }

    try {
      const feedbackEvents = await prisma.customerFeedbackEvent.findMany({
        where: { feedback: { leadId: { in: ids } } },
        include: {
          user: { select: { fullName: true } },
          feedback: { select: { id: true, leadId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      });
      for (const event of feedbackEvents) {
        const text = event.customerFeedback || event.nextAction || event.remarks || 'Customer feedback updated';
        events.push({
          id: `fb-${event.id}`,
          label: 'Feedback updated',
          description: text,
          timestamp: event.createdAt,
          userName: event.user?.fullName || null,
          leadRecordId: event.feedback?.leadId || null,
          leadCode: leadCodeById.get(event.feedback?.leadId) || null,
        });
      }
    } catch {
      // Feedback events are absent until that module is migrated.
    }

    try {
      const idSql = ids.map((id) => Prisma.sql`${id}::uuid`);
      const rows = await prisma.$queryRaw`
        SELECT a.id::text AS id, a.action, a.details, a.created_at, a.lead_id::text AS lead_id,
               u.full_name, l.lead_code
        FROM lead_activity a
        LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.lead_id IN (${Prisma.join(idSql)})
        ORDER BY a.created_at DESC
        LIMIT 40
      `;
      for (const row of rows) {
        const text = asText(row.details);
        events.push({
          id: `stf-${row.id}`,
          label: activityLabel(row.action, text),
          description: text || activityLabel(row.action, ''),
          timestamp: row.created_at,
          userName: row.full_name || null,
          leadRecordId: row.lead_id,
          leadCode: row.lead_code || leadCodeById.get(row.lead_id) || null,
        });
      }
    } catch {
      // Legacy lead_activity is not present in every environment.
    }
  }

  if (!events.length) {
    for (const lead of leads) {
      if (lead.createdAt) {
        events.push({
          id: `created-${lead.id}`,
          label: 'Lead created',
          description: `${lead.leadId || 'Lead'} created`,
          timestamp: lead.createdAt,
          userName: null,
          leadRecordId: lead.id,
          leadCode: lead.leadId || null,
        });
      }
      if (lead.updatedAt && lead.createdAt && new Date(lead.updatedAt) - new Date(lead.createdAt) > 60000) {
        events.push({
          id: `updated-${lead.id}`,
          label: 'Lead updated',
          description: `${lead.leadId || 'Lead'} updated`,
          timestamp: lead.updatedAt,
          userName: null,
          leadRecordId: lead.id,
          leadCode: lead.leadId || null,
        });
      }
      if (lead.outputCompletedAt) {
        events.push({
          id: `output-${lead.id}`,
          label: lead.outputStatus === 'COMPLETED' ? 'Lead completed' : 'Output submitted',
          description: `${lead.leadId || 'Lead'} output submitted`,
          timestamp: lead.outputCompletedAt,
          userName: lead.outputCompletedBy?.fullName || null,
          leadRecordId: lead.id,
          leadCode: lead.leadId || null,
        });
      }
    }
  }

  const seen = new Set();
  return events
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter((event) => {
      const key = `${event.label}|${event.leadRecordId}|${new Date(event.timestamp).toISOString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function leadTypeOptions(leads) {
  const map = new Map();
  for (const lead of leads) {
    const code = canonicalType(lead.requirement?.requirementType);
    if (!code || map.has(code)) continue;
    map.set(code, { code, label: labelFromCode(code) });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function attachFeedback(leads) {
  try {
    const customerFeedback = require('./customerFeedbackService');
    const map = await customerFeedback.summariesByLeadIds(leads.map((item) => item.id));
    return leads.map((item) => ({
      ...item,
      customerFeedback: map[item.id] || { code: 'NOT_REQUIRED', label: 'Not Required' },
    }));
  } catch {
    return leads.map((item) => ({
      ...item,
      customerFeedback: item.customerFeedback || { code: 'NOT_REQUIRED', label: 'Not Required' },
    }));
  }
}

function fullStatusDistribution(leads) {
  const counts = new Map();
  for (const lead of leads) {
    const code = lead.statusCode || 'UNKNOWN';
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return existingLeads.statusChoices(leads).map((item) => ({
    ...item,
    count: counts.get(item.code) || 0,
  }));
}

function locationDistribution(leads) {
  const map = new Map();
  for (const lead of leads) {
    const code = lead.locationPending ? '__pending' : (lead.location || '__pending');
    const label = lead.locationPending ? 'Location Pending' : (lead.location || 'Location Pending');
    const tone = code === '__pending' ? 'yellow' : 'blue';
    bump(map, code, { label, tone });
  }
  return [...map.values()]
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      if (a.code === '__pending') return -1;
      if (b.code === '__pending') return 1;
      return b.count - a.count || a.label.localeCompare(b.label);
    });
}

async function getDashboard(query = {}) {
  const statistics = stats.calculateLeadStatistics(await existingLeads.matchingLeads({}));
  const facetQuery = baseQuery(query);
  delete facetQuery.status;
  delete facetQuery.location;
  const matched = await existingLeads.matchingLeads(facetQuery);
  const withFeedback = await attachFeedback(matched);
  const leadTypes = leadTypeOptions(withFeedback);
  const shared = applyDashboardFilters(withFeedback, query);
  const statusScope = shared.filter((lead) => matchesLocation(lead, query));
  const locationScope = shared.filter((lead) => matchesStatus(lead, query));
  const leads = statusScope.filter((lead) => matchesStatus(lead, query));
  const includeCompletedDeadlines = ['status', 'location', 'salesPersonId', 'customerId', 'customerName', 'priority', 'outputRequired', 'outputStatus', 'feedback', 'leadType', 'scope', 'q', 'from', 'to'].some((key) => query[key]);
  const dashboard = buildDashboard(leads, { includeCompletedDeadlines });
  const activity = await recentActivity(leads);
  return {
    ...dashboard,
    ...statistics,
    statistics,
    matchedCount: leads.length,
    statusDistribution: fullStatusDistribution(statusScope),
    statusOptions: existingLeads.statusChoices(statusScope),
    locationDistribution: locationDistribution(locationScope),
    locations: existingLeads.locationChoices(locationScope),
    recentActivity: activity,
    leadTypes,
  };
}

module.exports = {
  getDashboard,
  buildDashboard,
  feedbackBucket,
  isDelayed,
  isActive,
  isPending,
  calculateLeadStatistics: stats.calculateLeadStatistics,
};
