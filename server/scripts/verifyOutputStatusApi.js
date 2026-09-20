const base = 'http://127.0.0.1:4000/api';

async function main() {
  const login = await (await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'ChangeMe@123' }),
  })).json();
  const headers = { Authorization: `Bearer ${login.token}` };
  const leads = await (await fetch(`${base}/leads`, { headers })).json();
  const sales = await (await fetch(`${base}/dashboard/sales`, { headers })).json();
  const lookups = await (await fetch(`${base}/lookups`, { headers })).json();
  const first = leads.items?.[0];
  console.log('status lookups', (lookups.OUTPUT_SUBMISSION_STATUS || []).map((x) => x.code));
  console.log('lead', first && {
    leadId: first.leadId,
    outputStatus: first.outputStatus,
    outputStatusLabel: first.outputStatusLabel,
    delayDays: first.delayDays,
  });
  console.log('sales output kpis', {
    onTime: sales.kpis?.outputOnTime,
    overdue: sales.kpis?.outputOverdue,
    delayed13: sales.kpis?.outputDelayed13,
    delayedOver3: sales.kpis?.outputDelayedOver3,
    onHold: sales.kpis?.outputOnHold,
    completed: sales.kpis?.outputCompleted,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
