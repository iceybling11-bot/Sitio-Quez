import { sb, state, esc, peso, dt, num, run, rpc, on, modal, badge, toast, isAdmin } from '../core.js';

export async function mine(el) {
  const open = await run(sb.from('cashier_shifts').select('*').eq('user_id', state.profile.id).eq('status', 'open').maybeSingle());
  const past = await run(sb.from('cashier_shifts').select('*').eq('user_id', state.profile.id).eq('status', 'closed').order('opened_at', { ascending: false }).limit(15));
  let live = '';
  if (open) {
    const s = await rpc('shift_summary', { p_id: open.id });
    live = `<div class="card mb-3"><div class="card-body"><h5>Shift open since ${dt(open.opened_at)}</h5>
      <div>Opening cash: ${peso(open.opening_cash)}</div><div>Cash sales: ${peso(s.cash_sales)}</div><div>Refunds: ${peso(s.refunds)}</div><div class="fw-bold">Expected cash in drawer: ${peso(s.expected_cash)}</div>
      <div class="small text-muted mt-1">${Object.entries(s.by_method).map(([k, v]) => `${esc(k)} ${peso(v)}`).join(' · ')}</div>
      <button class="btn btn-danger mt-3" id="close">Close shift</button></div></div>`;
  }
  el.innerHTML = `<h4 class="mb-3">My shift</h4>${open ? live : '<div class="card card-body mb-3"><p>No open shift. Count your till and open one before taking payments.</p><button class="btn btn-sv align-self-start" id="open">Open shift</button></div>'}
  <h6>Previous shifts</h6><div class="card"><table class="table table-sm mb-0"><tbody>${past.map((s) => `<tr><td><a href="#/shift/${s.id}">${dt(s.opened_at)}</a></td><td>Counted ${peso(s.closing_cash_counted)}</td><td>${s.approved_by ? badge('Verified') : badge('Pending')}</td></tr>`).join('') || '<tr><td class="p-3 text-muted">None.</td></tr>'}</tbody></table></div>`;
  on(el, 'click', '#open', () => modal({ title: 'Open shift', okText: 'Open', body: '<label class="form-label">Opening cash (float)</label><input name="cash" type="number" min="0" step="0.01" value="0" class="form-control" required>',
    onOk: async (f) => { await rpc('open_shift', { p_opening: num(f.cash) }); mine(el); } }));
  on(el, 'click', '#close', () => modal({ title: 'Close shift', okText: 'Close shift', okClass: 'btn-danger', body: '<label class="form-label">Cash counted in drawer</label><input name="cash" type="number" min="0" step="0.01" class="form-control mb-2" required><label class="form-label">Notes</label><input name="notes" class="form-control">',
    onOk: async (f) => { await rpc('close_shift', { p_id: open.id, p_counted: num(f.cash), p_notes: f.notes }); toast('Shift closed.'); mine(el); } }));
}

export async function detail(el, { id }) {
  const s = await run(sb.from('cashier_shifts').select('*, user:profiles!user_id(name,username), approver:profiles!approved_by(name,username)').eq('id', id).maybeSingle());
  if (!s) { el.innerHTML = '<h4>Shift not found</h4>'; return; }
  const sum = await rpc('shift_summary', { p_id: s.id });
  const v = sum.variance;
  el.innerHTML = `<h4 class="mb-3">Shift — ${esc(s.user?.name || s.user?.username)} ${badge(s.status)}</h4><div class="card card-body" style="max-width:520px">
    <div>Opened: ${dt(s.opened_at)}</div><div>Closed: ${dt(s.closed_at) || '—'}</div><hr>
    <div>Opening cash: ${peso(s.opening_cash)}</div><div>Cash sales: ${peso(sum.cash_sales)}</div><div>Refunds: ${peso(sum.refunds)}</div>
    <div class="fw-bold">Expected: ${peso(sum.expected_cash)}</div>${s.status === 'closed' ? `<div>Counted: ${peso(s.closing_cash_counted)}</div><div class="${v < 0 ? 'text-danger' : v > 0 ? 'text-warning' : 'text-success'} fw-bold">Variance: ${peso(v)} ${v < 0 ? '(short)' : v > 0 ? '(over)' : ''}</div>` : ''}
    <div class="small text-muted mt-2">${Object.entries(sum.by_method).map(([k, x]) => `${esc(k)} ${peso(x)}`).join(' · ')}</div>${s.notes ? `<div class="mt-2">Notes: ${esc(s.notes)}</div>` : ''}
    ${s.approver ? `<div class="text-success mt-2">Reviewed by ${esc(s.approver.name || s.approver.username)}</div>` : ''}
    ${isAdmin() && s.status === 'closed' && !s.approved_by ? '<button class="btn btn-success mt-3" id="ap">Mark reviewed</button>' : ''}</div>`;
  on(el, 'click', '#ap', async () => { await rpc('approve_shift', { p_id: s.id }); toast('Shift reviewed.'); detail(el, { id }); });
}

export async function all(el) {
  const data = await run(sb.from('cashier_shifts').select('*, user:profiles!user_id(name,username)').order('opened_at', { ascending: false }).limit(100));
  el.innerHTML = `<h4 class="mb-3">All shifts</h4><div class="card"><table class="table mb-0"><thead><tr><th>Cashier</th><th>Opened</th><th>Status</th><th>Counted</th><th>Reviewed</th></tr></thead><tbody>
  ${data.map((s) => `<tr class="clickable" onclick="location.hash='#/shift/${s.id}'"><td>${esc(s.user?.name || s.user?.username)}</td><td>${dt(s.opened_at)}</td><td>${badge(s.status)}</td><td>${s.status === 'closed' ? peso(s.closing_cash_counted) : '—'}</td><td>${s.approved_by ? '✓' : ''}</td></tr>`).join('') || '<tr><td colspan=5 class="p-3 text-muted">None.</td></tr>'}</tbody></table></div>`;
}
