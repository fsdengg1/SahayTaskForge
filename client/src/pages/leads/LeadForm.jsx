import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, fmtDateTime, toInputDate } from '../../utils/format';
import Modal from '../../components/Modal';

const CHECKLIST = [
  ['PALLET_DIMS', 'Pallet / material dimensions confirmed'],
  ['LOAD_CAPACITY', 'Load capacity confirmed'],
  ['FLOOR_AREA', 'Available floor area confirmed'],
  ['CLEAR_HEIGHT', 'Clear height confirmed'],
  ['HANDLING', 'Handling equipment details confirmed'],
  ['SITE_DOCS', 'Site photos / layout received'],
  ['QTY', 'Customer requirement / quantity confirmed'],
  ['TIMELINE', 'Installation timeline confirmed'],
];

const empty = {
  leadDate: toInputDate(new Date()),
  sourceCode: '',
  customerId: '',
  companyName: '',
  industry: '',
  contactPerson: '',
  designation: '',
  mobile: '',
  email: '',
  companyAddress: '',
  plantLocation: '',
  requirementType: '',
  materialToStore: '',
  storageMethodCode: '',
  requiredQuantity: '',
  noOfLevels: '',
  loadPerPalletKg: '',
  palletMaterialSize: '',
  rackLength: '',
  rackDepth: '',
  rackHeight: '',
  requiredRackHeight: '',
  availableAreaLength: '',
  availableAreaWidth: '',
  clearHeight: '',
  floorLoadingCapacity: '',
  floorCondition: '',
  existingRacking: '',
  existingStorage: '',
  sitePhotosAvailable: false,
  layoutAvailable: false,
  equipmentAvailable: [],
  equipmentRequired: [],
  forkLengthCapacity: '',
  requiredLiftingHeight: '',
  expectedProjectDate: '',
  installationTimeline: '',
  budgetCurrency: 'INR',
  budgetAmount: '',
  competitor: '',
  quotationRequiredBy: '',
  decisionMaker: '',
  outputRequired: 'BOM_DRAWINGS',
  priorityCode: 'MEDIUM',
  statusCode: 'NEW',
  salesPersonId: '',
  nextFollowUpDate: '',
  customerNeed: '',
  expectedOrderDate: '',
  remarks: '',
};

export default function LeadForm() {
  const { id } = useParams();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [checklist, setChecklist] = useState(CHECKLIST.map(([itemCode, label]) => ({ itemCode, label, completed: false })));
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ companyName: '', industry: '', address: '', phone: '', email: '' });
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api.get('/customers?pageSize=100').then((d) => setCustomers(d.items || [])).catch(() => {});
    api.get('/users?sales=true').then(setSales).catch(() => {});
  }, []);

  useEffect(() => {
    if (id) return undefined;
    function loadPreview() {
      api.get('/leads/deadline-preview').then(setPreview).catch(() => {});
    }
    loadPreview();
    const timer = setInterval(loadPreview, 30000);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    api.get(`/leads/${id}`).then((lead) => {
      const req = lead.requirement || {};
      setForm({
        ...empty,
        ...lead,
        companyName: lead.customer?.companyName || '',
        contactPerson: lead.contact?.name || '',
        designation: lead.contact?.designation || '',
        mobile: lead.contact?.mobile || '',
        email: lead.contact?.email || '',
        companyAddress: lead.customer?.address || '',
        plantLocation: lead.site?.address || '',
        ...req,
        leadDate: toInputDate(lead.leadDate),
        nextFollowUpDate: toInputDate(lead.nextFollowUpDate),
        expectedOrderDate: toInputDate(lead.expectedOrderDate),
        expectedProjectDate: toInputDate(lead.expectedProjectDate),
        quotationRequiredBy: toInputDate(lead.quotationRequiredBy),
        equipmentAvailable: lead.equipment?.filter((e) => e.kind === 'AVAILABLE').map((e) => e.equipmentCode) || [],
        equipmentRequired: lead.equipment?.filter((e) => e.kind === 'REQUIRED').map((e) => e.equipmentCode) || [],
        salesPersonName: lead.salesPerson?.fullName || '',
      });
      if (lead.checklist?.length) setChecklist(lead.checklist);
    });
  }, [id]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggleChip(key, code) {
    setForm((f) => {
      const cur = f[key] || [];
      return { ...f, [key]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] };
    });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      if (id) {
        await api.put(`/leads/${id}`, { ...form, checklist });
        setNotice('Lead updated successfully.');
        navigate(`/leads/${id}`);
        return;
      }
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (Array.isArray(v)) fd.append(k, JSON.stringify(v));
        else if (v != null) fd.append(k, v);
      });
      fd.append('checklist', JSON.stringify(checklist));
      photos.forEach((f) => fd.append('photos', f));
      drawings.forEach((f) => fd.append('drawings', f));
      const res = await api.post('/leads', fd);
      setNotice(res.message || 'Lead created successfully.');
      navigate(`/leads/${res.lead.id}`);
    } catch (err) {
      setErrors({ form: err.message, ...(err.details?.field ? { [err.details.field]: err.message } : {}) });
    } finally {
      setBusy(false);
    }
  }

  async function createCustomer(e) {
    e.preventDefault();
    const created = await api.post('/customers', newCust);
    setCustomers((c) => [created, ...c]);
    set('customerId', created.id);
    set('companyName', created.companyName);
    set('industry', created.industry || form.industry);
    setShowCustomer(false);
  }

  const industries = lookups.INDUSTRY || [];

  return (
    <form onSubmit={save}>
      <div className="page-head">
        <div>
          <h2>{id ? 'Edit Lead' : 'Create Lead'}</h2>
          <p>Lead ID is generated automatically on save.</p>
        </div>
        <div className="btn-row">
          <button className="btn secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn copper" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Lead'}</button>
        </div>
      </div>
      {notice && <div className="notice">{notice}</div>}
      {errors.form && <div className="notice err">{errors.form}</div>}

      <div className="section-title">Customer & contact details</div>
      <div className="card">
        <div className="form-grid">
          <label className="field">Lead Date<input type="date" value={form.leadDate} onChange={(e) => set('leadDate', e.target.value)} /></label>
          <label className="field">Lead Source
            <select value={form.sourceCode} onChange={(e) => set('sourceCode', e.target.value)}>
              <option value="">Select</option>
              {(lookups.LEAD_SOURCE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Customer / Company Name
            <select value={form.customerId} onChange={(e) => {
              const c = customers.find((x) => x.id === e.target.value);
              set('customerId', e.target.value);
              if (c) {
                set('companyName', c.companyName);
                set('industry', c.industry || form.industry);
              }
            }}>
              <option value="">Select existing customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="btn ghost" type="button" onClick={() => setShowCustomer(true)}>+ Create New Customer</button>
          </div>
          {!form.customerId && (
            <label className="field">Or enter company name
              <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
              {errors.companyName && <span className="field-error">{errors.companyName}</span>}
            </label>
          )}
          <label className="field">Industry
            <input list="industries" value={form.industry} onChange={(e) => set('industry', e.target.value)} />
            <datalist id="industries">{industries.map((i) => <option key={i.code} value={i.label} />)}</datalist>
          </label>
          <label className="field">Contact Person<input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></label>
          <label className="field">Designation<input value={form.designation} onChange={(e) => set('designation', e.target.value)} /></label>
          <label className="field">Mobile Number
            <input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            {errors.mobile && <span className="field-error">{errors.mobile}</span>}
          </label>
          <label className="field">Email ID
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </label>
          <label className="field full">Company Address / Location<textarea value={form.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} /></label>
          <label className="field full">Plant / Warehouse Location<input value={form.plantLocation} onChange={(e) => set('plantLocation', e.target.value)} /></label>
        </div>
      </div>

      <div className="section-title">Storage requirement</div>
      <div className="card">
        <div className="form-grid">
          <label className="field">Requirement Type
            <select value={form.requirementType} onChange={(e) => set('requirementType', e.target.value)}>
              <option value="">Select</option>
              {(lookups.REQUIREMENT_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Material to be Stored<input value={form.materialToStore} onChange={(e) => set('materialToStore', e.target.value)} /></label>
          <label className="field">Storage Method
            <select value={form.storageMethodCode} onChange={(e) => set('storageMethodCode', e.target.value)}>
              <option value="">Select</option>
              {(lookups.STORAGE_METHOD || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Required Quantity / Positions<input value={form.requiredQuantity} onChange={(e) => set('requiredQuantity', e.target.value)} /></label>
          <label className="field">No. of Levels<input value={form.noOfLevels} onChange={(e) => set('noOfLevels', e.target.value)} /></label>
          <label className="field">Load per Pallet / Level (kg)<input value={form.loadPerPalletKg} onChange={(e) => set('loadPerPalletKg', e.target.value)} /></label>
          <label className="field">Pallet / Material Size<input value={form.palletMaterialSize} onChange={(e) => set('palletMaterialSize', e.target.value)} /></label>
          <label className="field">Rack Length<input value={form.rackLength} onChange={(e) => set('rackLength', e.target.value)} /></label>
          <label className="field">Rack Depth<input value={form.rackDepth} onChange={(e) => set('rackDepth', e.target.value)} /></label>
          <label className="field">Rack Height<input value={form.rackHeight} onChange={(e) => set('rackHeight', e.target.value)} /></label>
          <label className="field">Required Rack Height<input value={form.requiredRackHeight} onChange={(e) => set('requiredRackHeight', e.target.value)} /></label>
        </div>
      </div>

      <div className="section-title">Warehouse / site details</div>
      <div className="card">
        <div className="form-grid">
          <label className="field">Available Area Length<input value={form.availableAreaLength} onChange={(e) => set('availableAreaLength', e.target.value)} /></label>
          <label className="field">Available Area Width<input value={form.availableAreaWidth} onChange={(e) => set('availableAreaWidth', e.target.value)} /></label>
          <label className="field">Clear Height<input value={form.clearHeight} onChange={(e) => set('clearHeight', e.target.value)} /></label>
          <label className="field">Floor Loading Capacity<input value={form.floorLoadingCapacity} onChange={(e) => set('floorLoadingCapacity', e.target.value)} /></label>
          <label className="field">Floor Condition<input value={form.floorCondition} onChange={(e) => set('floorCondition', e.target.value)} /></label>
          <label className="field">Existing Racking<input value={form.existingRacking} onChange={(e) => set('existingRacking', e.target.value)} /></label>
          <label className="field full">Existing Storage System<input value={form.existingStorage} onChange={(e) => set('existingStorage', e.target.value)} /></label>
          <label className="field">Site photos
            <input type="file" multiple accept="image/*" onChange={(e) => { setPhotos([...e.target.files]); set('sitePhotosAvailable', e.target.files.length > 0); }} />
          </label>
          <label className="field">Layout / drawing
            <input type="file" multiple onChange={(e) => { setDrawings([...e.target.files]); set('layoutAvailable', e.target.files.length > 0); }} />
          </label>
        </div>
      </div>

      <div className="section-title">Material handling equipment</div>
      <div className="card">
        <p>Equipment available</p>
        <div className="chips">
          {(lookups.EQUIPMENT_TYPE || []).map((e) => (
            <button key={e.code} type="button" className={`chip ${form.equipmentAvailable.includes(e.code) ? 'on' : ''}`} onClick={() => toggleChip('equipmentAvailable', e.code)}>{e.label}</button>
          ))}
        </div>
        <p style={{ marginTop: 12 }}>Equipment required</p>
        <div className="chips">
          {(lookups.EQUIPMENT_TYPE || []).map((e) => (
            <button key={e.code} type="button" className={`chip ${form.equipmentRequired.includes(e.code) ? 'on' : ''}`} onClick={() => toggleChip('equipmentRequired', e.code)}>{e.label}</button>
          ))}
        </div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">Fork Length / Load Capacity<input value={form.forkLengthCapacity} onChange={(e) => set('forkLengthCapacity', e.target.value)} /></label>
          <label className="field">Required Lifting Height<input value={form.requiredLiftingHeight} onChange={(e) => set('requiredLiftingHeight', e.target.value)} /></label>
        </div>
      </div>

      <div className="section-title">Commercial & project details</div>
      <div className="card">
        <div className="form-grid">
          <label className="field">Expected Project Date<input type="date" value={form.expectedProjectDate} onChange={(e) => set('expectedProjectDate', e.target.value)} /></label>
          <label className="field">Installation Timeline<input value={form.installationTimeline} onChange={(e) => set('installationTimeline', e.target.value)} /></label>
          <label className="field">Currency
            <select value={form.budgetCurrency} onChange={(e) => set('budgetCurrency', e.target.value)}>
              {(lookups.CURRENCY || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Budget / Target Price<input value={form.budgetAmount} onChange={(e) => set('budgetAmount', e.target.value)} /></label>
          <label className="field">Competitor / Existing Vendor<input value={form.competitor} onChange={(e) => set('competitor', e.target.value)} /></label>
          <label className="field">Quotation Required By<input type="date" value={form.quotationRequiredBy} onChange={(e) => set('quotationRequiredBy', e.target.value)} /></label>
          <label className="field">Decision Maker<input value={form.decisionMaker} onChange={(e) => set('decisionMaker', e.target.value)} /></label>
        </div>
      </div>

      <div className="section-title">Lead qualification & follow-up</div>
      <div className="card">
        <div className="form-grid">
          <label className="field">Output Required
            <select value={form.outputRequired} onChange={(e) => set('outputRequired', e.target.value)}>
              <option value="">Select</option>
              {(lookups.OUTPUT_REQUIRED || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              {form.outputRequired && !(lookups.OUTPUT_REQUIRED || []).some((s) => s.code === form.outputRequired) && (
                <option value={form.outputRequired}>{form.outputRequired}</option>
              )}
            </select>
          </label>
          <div className="field">
            <span>Submission Deadline</span>
            <div className="readonly-value">{fmtDate(id ? form.submissionDeadline : preview?.submissionDeadline)}</div>
            <small className="field-hint">Auto-calculated · System calculated</small>
          </div>
          <div className="field">
            <span>Created</span>
            <div className="readonly-value">{id ? fmtDateTime(form.createdAt) : fmtDateTime(preview?.createdAt)}</div>
            <small className="field-hint">Server time · Asia/Kolkata</small>
          </div>
          <label className="field">Lead Priority
            <select value={form.priorityCode} onChange={(e) => set('priorityCode', e.target.value)}>
              {(lookups.PRIORITY || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Current Status
            <select value={form.statusCode} onChange={(e) => set('statusCode', e.target.value)}>
              {(lookups.LEAD_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              {form.statusCode && !(lookups.LEAD_STATUS || []).some((s) => s.code === form.statusCode) && (
                <option value={form.statusCode}>{String(form.statusCode).replaceAll('_', ' ')}</option>
              )}
            </select>
          </label>
          <label className="field">Sales Person
            <select value={form.salesPersonId} onChange={(e) => set('salesPersonId', e.target.value)}>
              <option value="">Select</option>
              {sales.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              {form.salesPersonId && !sales.some((u) => u.id === form.salesPersonId) && (
                <option value={form.salesPersonId}>{form.salesPersonName || 'Assigned owner'}</option>
              )}
            </select>
          </label>
          <label className="field">Next Follow-up Date<input type="date" value={form.nextFollowUpDate} onChange={(e) => set('nextFollowUpDate', e.target.value)} /></label>
          <label className="field">Expected Order Date<input type="date" value={form.expectedOrderDate} onChange={(e) => set('expectedOrderDate', e.target.value)} /></label>
          <label className="field full">Customer Need / Pain Point<textarea value={form.customerNeed} onChange={(e) => set('customerNeed', e.target.value)} /></label>
          <label className="field full">Remarks / Additional Requirements<textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></label>
        </div>
      </div>

      <div className="section-title">Preliminary technical checklist</div>
      <div className="card">
        {checklist.map((item) => (
          <div className="check-row" key={item.itemCode}>
            <span>{item.label}</span>
            <button type="button" className={`toggle ${item.completed ? 'on' : ''}`} onClick={() => setChecklist((rows) => rows.map((r) => r.itemCode === item.itemCode ? { ...r, completed: !r.completed } : r))} />
          </div>
        ))}
      </div>

      {showCustomer && (
        <Modal title="Create customer" onClose={() => setShowCustomer(false)}>
          <form onSubmit={createCustomer} className="form-grid">
            <label className="field full">Company Name<input value={newCust.companyName} onChange={(e) => setNewCust({ ...newCust, companyName: e.target.value })} /></label>
            <label className="field">Industry<input value={newCust.industry} onChange={(e) => setNewCust({ ...newCust, industry: e.target.value })} /></label>
            <label className="field">Phone<input value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} /></label>
            <label className="field full">Address<textarea value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} /></label>
            <label className="field full">Email<input value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} /></label>
            <button className="btn" type="submit">Save customer</button>
          </form>
        </Modal>
      )}
    </form>
  );
}
