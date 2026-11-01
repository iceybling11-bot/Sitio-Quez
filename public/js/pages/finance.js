import { sb, esc, peso, dt, dOnly, num, run, rpc, on, modal, confirmBox, downloadCSV, toast, hashParams, today, state } from '../core.js';

export async function expenses(el) {
  const data = await run(sb.from('expenses').select('*').order('date', { ascending: false }).order('id', { ascending: false }).limit(200));
  const total = data.reduce((a, e) => a + num(e.amount), 0);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Expenses</h4><button class="btn btn-sv" id="add">+ Add expense</button></div>
  <div class="card"><table class="table mb-0"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="text-end">Amount</th><th></th></tr></thead><tbody>
  ${data.map((e) => `<tr><td>${dOnly(e.date)}</td><td>${esc(e.category || '')}</td><td>${esc(e.description || '')}</td><td class="text-end">${peso(e.amount)}</td><td><button class="btn btn-sm text-danger" data-del="${e.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan=5 class="p-3 text-muted">None.</td></tr>'}
  <tr class="fw-bold"><td colspan=3>Total (latest ${data.length})</td><td class="text-end">${peso(total)}</td><td></td></tr></tbody></table></div>`;
  on(el, 'click', '#add', () => modal({ title: 'Add expense', body: `<label class="form-label">Category</label><select name="category" class="form-select mb-2">${['Ingredients', 'Utilities', 'Salaries', 'Rent', 'Supplies', 'Maintenance', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select>
    <label class="form-label">Description</label><input name="description" class="form-control mb-2"><label class="form-label">Amount</label><input name="amount" type="number" step="0.01" min="0.01" class="form-control mb-2" required><label class="form-label">Date</label><input name="date" type="date" value="${today()}" class="form-control" required>`,
    onOk: async (f) => { await run(sb.from('expenses').insert({ ...f, amount: num(f.amount), recorded_by: state.profile.id })); toast('Expense saved.'); expenses(el); } }));
  on(el, 'click', '[data-del]', (e, t) => confirmBox('Delete this expense?', async () => { await run(sb.from('expenses').delete().eq('id', t.dataset.del)); expenses(el); }, 'Delete'));
}

export async function fetchAll(table, select, build) {
  const out = []; for (let from = 0; ; from += 1000) {
    const { data, error } = await build(sb.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) break;
  } return out;
}

export async function reports(el) {
  const p = hashParams(); const end = p.get('end') || today();
  const start = p.get('start') || new Date(new Date(end + 'T00:00:00').getTime() - 29 * 864e5).toISOString().slice(0, 10);
  const r = await rpc('report_summary', { p_start: start, p_end: end });
  const net = num(r.sales_total) - num(r.refunds) - num(r.expenses);
  const money = (o) => Object.entries(o).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="text-end">${peso(v)}</td></tr>`).join('') || '<tr><td class="text-muted">—</td></tr>';
  const cnt = (o) => Object.entries(o).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="text-end">${esc(v)}</td></tr>`).join('') || '<tr><td class="text-muted">—</td></tr>';
  el.innerHTML = `<div class="d-flex justify-content-between flex-wrap gap-2 mb-3"><h4>Reports</h4>
    <form class="d-flex gap-2" onsubmit="location.hash='#/reports?start='+this.s.value+'&end='+this.e.value;return false"><input type="date" name="s" value="${start}" class="form-control"><input type="date" name="e" value="${end}" class="form-control"><button class="btn btn-sv">Apply</button></form></div>
  <div class="row g-3 mb-3">${[['Sales', peso(r.sales_total) + ` (${r.sales_count})`], ['Refunds', peso(r.refunds)], ['Expenses', peso(r.expenses)], ['Net (sales − refunds − expenses)', peso(net)], ['Discounts given', peso(r.discounts)], ['Voided sales', r.voided]].map(([l, v]) => `<div class="col-md-4 col-xl-2"><div class="card card-stat"><div class="card-body py-2"><div class="text-muted small">${l}</div><div class="fw-bold">${v}</div></div></div></div>`).join('')}</div>
  <div class="row g-3"><div class="col-lg-8"><div class="card"><div class="card-header">Daily sales</div><div class="card-body"><canvas id="c" height="100"></canvas></div></div></div>
  <div class="col-lg-4"><div class="card mb-3"><div class="card-header">By payment method</div><table class="table table-sm mb-0"><tbody>${money(r.by_method)}</tbody></table></div>
  <div class="card mb-3"><div class="card-header">Guests served</div><table class="table table-sm mb-0"><tbody>${cnt(r.pax)}</tbody></table></div>
  <div class="card"><div class="card-header">Reservations</div><table class="table table-sm mb-0"><tbody>${cnt(r.reservations)}</tbody></table></div></div></div>
  <div class="mt-3 d-flex gap-2"><button class="btn btn-outline-success" data-x="sales">Export sales CSV</button><button class="btn btn-outline-success" data-x="res">Export reservations CSV</button><button class="btn btn-outline-success" data-x="exp">Export expenses CSV</button><button class="btn btn-outline-secondary" onclick="window.print()">Print / save as PDF</button></div>`;
  new Chart(el.querySelector('#c'), { type: 'line', data: { labels: r.by_day.map((d) => d.day), datasets: [{ label: 'PHP', data: r.by_day.map((d) => num(d.total)), borderColor: '#2f7a4f', tension: .25 }] } });
  const from = `${start}T00:00:00+08:00`, to = `${end}T23:59:59+08:00`;
  on(el, 'click', '[data-x]', async (e, t) => {
    const k = t.dataset.x;
    if (k === 'sales') { const rows = await fetchAll('sales', 'sale_number,created_at,customer_name,subtotal,discount,total,status', (q) => q.gte('created_at', from).lte('created_at', to).order('created_at'));
      downloadCSV(`sales_${start}_${end}.csv`, [['Sale #', 'Date', 'Customer', 'Subtotal', 'Discount', 'Total', 'Status'], ...rows.map((s) => [s.sale_number, s.created_at, s.customer_name, s.subtotal, s.discount, s.total, s.status])]); }
    if (k === 'res') { const rows = await fetchAll('reservations', 'reservation_number,date,time,customer_name,pax,actual_pax,status,total_bill', (q) => q.gte('date', start).lte('date', end).order('date'));
      downloadCSV(`reservations_${start}_${end}.csv`, [['Reservation #', 'Date', 'Time', 'Customer', 'Pax', 'Actual pax', 'Status', 'Total bill'], ...rows.map((s) => [s.reservation_number, s.date, s.time, s.customer_name, s.pax, s.actual_pax, s.status, s.total_bill])]); }
    if (k === 'exp') { const rows = await fetchAll('expenses', 'date,category,description,amount', (q) => q.gte('date', start).lte('date', end).order('date'));
      downloadCSV(`expenses_${start}_${end}.csv`, [['Date', 'Category', 'Description', 'Amount'], ...rows.map((s) => [s.date, s.category, s.description, s.amount])]); }
  });
}
