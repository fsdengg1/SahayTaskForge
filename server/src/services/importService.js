const ExcelJS = require('exceljs');
const { prisma } = require('../prisma');
const { findOrCreateCustomer, addContact } = require('./customerService');
const { nextNumber } = require('../utils/numbering');
const { logActivity } = require('../utils/activity');

function cell(row, i) {
  const v = row.getCell(i).value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function importWorkbook(filePath, user) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const summary = { sheets: [], created: { customers: 0, leads: 0, projects: 0 }, skipped: 0, errors: [] };

  for (const sheet of workbook.worksheets) {
    const header = [];
    sheet.getRow(1).eachCell((c, i) => {
      header[i] = String(c.value || '').trim().toLowerCase();
    });
    const col = (names) => header.findIndex((h) => h && names.some((n) => h.includes(n)));
    const idx = {
      customer: col(['customer', 'company', 'account']),
      contact: col(['contact', 'person']),
      phone: col(['phone', 'mobile']),
      email: col(['email']),
      status: col(['status']),
      date: col(['date', 'enquiry', 'lead date']),
      product: col(['product', 'rack', 'requirement']),
      sales: col(['sales', 'owner', 'executive']),
      remarks: col(['remark', 'comment', 'note']),
      project: col(['project']),
      po: col(['po', 'order no', 'order number']),
    };

    let createdLeads = 0;
    let createdProjects = 0;
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const company = idx.customer > 0 ? cell(row, idx.customer) : '';
      if (!company) {
        summary.skipped += 1;
        continue;
      }
      try {
        const customer = await findOrCreateCustomer({ companyName: company }, user.id);
        if (idx.contact > 0 && cell(row, idx.contact)) {
          const name = cell(row, idx.contact);
          const exists = await prisma.customerContact.findFirst({ where: { customerId: customer.id, name } });
          if (!exists) {
            await addContact(customer.id, {
              name,
              mobile: idx.phone > 0 ? cell(row, idx.phone) : null,
              email: idx.email > 0 ? cell(row, idx.email) : null,
            });
          }
        }
        const contact = await prisma.customerContact.findFirst({ where: { customerId: customer.id } });
        const leadId = await nextNumber('LEAD');
        const rawStatus = idx.status > 0 ? cell(row, idx.status).toUpperCase() : 'NEW';
        const statusCode = mapStatus(rawStatus);
        const lead = await prisma.lead.create({
          data: {
            leadId,
            leadDate: idx.date > 0 ? parseDate(cell(row, idx.date)) || new Date() : new Date(),
            customerId: customer.id,
            contactId: contact?.id || null,
            statusCode,
            remarks: idx.remarks > 0 ? cell(row, idx.remarks) : `Imported from sheet ${sheet.name}`,
            createdById: user.id,
            requirement: {
              create: { materialToStore: idx.product > 0 ? cell(row, idx.product) : null },
            },
          },
        });
        createdLeads += 1;
        summary.created.leads += 1;

        if (statusCode === 'WON' && (idx.project > 0 || idx.po > 0)) {
          const projectId = await nextNumber('PROJECT');
          await prisma.project.create({
            data: {
              projectId,
              name: idx.project > 0 && cell(row, idx.project) ? cell(row, idx.project) : `${company} project`,
              leadId: lead.id,
              customerId: customer.id,
              poNumber: idx.po > 0 ? cell(row, idx.po) : null,
              currentStageCode: 'ORDER_REVIEW',
              currentStatusCode: 'IN_PROGRESS',
              createdById: user.id,
            },
          });
          createdProjects += 1;
          summary.created.projects += 1;
        }
      } catch (err) {
        summary.errors.push({ sheet: sheet.name, row: r, message: 'Row could not be imported.' });
      }
    }
    summary.sheets.push({ name: sheet.name, leads: createdLeads, projects: createdProjects });
  }

  summary.created.customers = await prisma.customer.count();
  await logActivity({
    userId: user.id,
    action: 'EXCEL_IMPORTED',
    entity: 'Import',
    entityId: 'excel',
    description: `Imported ${summary.created.leads} leads from workbook`,
  });
  return summary;
}

function mapStatus(raw) {
  if (raw.includes('WON') || raw.includes('ORDER') || raw.includes('PO')) return 'WON';
  if (raw.includes('LOST')) return 'LOST';
  if (raw.includes('HOLD')) return 'ON_HOLD';
  if (raw.includes('QUOTE') || raw.includes('QUOT')) return 'QUOTATION_SENT';
  if (raw.includes('FOLLOW')) return 'CUSTOMER_FOLLOW_UP';
  if (raw.includes('NEGO')) return 'NEGOTIATION';
  return 'NEW';
}

module.exports = { importWorkbook };
