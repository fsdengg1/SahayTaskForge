const base = 'http://127.0.0.1:4000/api';

async function main() {
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'ChangeMe@123' }),
  });
  const login = await loginRes.json();
  if (!login.token) throw new Error(`Login failed: ${JSON.stringify(login)}`);
  const headers = { Authorization: `Bearer ${login.token}` };

  const preview = await (await fetch(`${base}/leads/deadline-preview`, { headers })).json();
  const leads = await (await fetch(`${base}/leads`, { headers })).json();
  const lookups = await (await fetch(`${base}/lookups`, { headers })).json();
  const sales = await (await fetch(`${base}/dashboard/sales`, { headers })).json();

  console.log('preview', {
    createdAt: preview.createdAt,
    deadline: preview.submissionDeadline,
    daysAdded: preview.daysAdded,
    beforeCutoff: preview.beforeCutoff,
    timezone: preview.timezone,
  });
  console.log('lookups', (lookups.OUTPUT_REQUIRED || []).map((x) => x.label));
  console.log('lead', leads.items?.[0] && {
    leadId: leads.items[0].leadId,
    outputRequired: leads.items[0].outputRequired,
    submissionDeadline: leads.items[0].submissionDeadline,
    deadlineStatus: leads.items[0].deadlineStatus,
  });
  console.log('sales kpis', {
    outputPending: sales.kpis?.outputPending,
    outputDueToday: sales.kpis?.outputDueToday,
    outputOverdue: sales.kpis?.outputOverdue,
    outputCompleted: sales.kpis?.outputCompleted,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
