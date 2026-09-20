import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../services/api';

export default function CustomerDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  useEffect(() => { api.get(`/customers/${id}`).then(setC); }, [id]);
  if (!c) return <div className="loading">Loading…</div>;
  return (
    <div>
      <div className="page-head"><div><h2>{c.companyName}</h2><p>{c.customerId} · {c.industry}</p></div></div>
      <div className="grid-2">
        <div className="card">
          <h3>Contacts</h3>
          {c.contacts.map((x) => <p key={x.id}>{x.name} · {x.mobile} · {x.email}</p>)}
        </div>
        <div className="card">
          <h3>Sites</h3>
          {c.sites.map((x) => <p key={x.id}>{x.name} · {x.address}</p>)}
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Leads</h3>
          {c.leads.map((l) => <p key={l.id}><Link to={`/leads/${l.id}`}>{l.leadId}</Link> · {l.statusCode}</p>)}
        </div>
        <div className="card">
          <h3>Projects</h3>
          {c.projects.map((p) => <p key={p.id}><Link to={`/projects/${p.id}`}>{p.projectId}</Link> {p.name}</p>)}
        </div>
      </div>
    </div>
  );
}
