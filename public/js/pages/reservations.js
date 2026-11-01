import { sb, esc, peso, dt, dOnly, tm, num, run, rpc, on, modal, confirmBox, badge, pager, isAdmin, toast, uploadProof, signedUrl, hashParams, today, state } from '../core.js';

const METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Card'];
const opt = (list, sel) => list.map((m) => `<option ${m === sel ? 'selected' : ''}>${m}</option>`).join('');

export async function list(el) {
  const p = hashParams(); const status = p.get('status') || ''; const page = Math.max(1, +p.get('page') || 1);
  const q = (p.get('q') || '').replace(/[,()%*]/g, ' ').trim();
  let qb = sb.from('reservations').select('id,reservation_number,customer_name,phone,date,time,pax,status,event_type', { count: 'exact' }).order('date', { ascending: false }).order('time', { ascending: false });
  if (status) qb = qb.eq('status', status);
  if (q) qb = qb.or(`customer_name.ilike.%${q}%,reservation_number.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, count, error } = await qb.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error(error.message);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Reservations</h4><div class="d-flex gap-2"><a class="btn btn-outline-success" href="#/reservations/calendar">Calendar</a><a class="btn btn-sv" href="#/reservations/new">+ New</a></div></div>
  <form class="row g-2 mb-3" onsubmit="location.hash='#/reservations?status='+encodeURIComponent(this.status.value)+'&q='+encodeURIComponent(this.q.value);return false">
    <div class="col-md-3"><select name="status" class="form-select"><option value="">All statuses</option>${['Reserved', 'Confirmed', 'Checked In', 'Completed', 'Cancelled', 'No Show'].map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="col-md-6"><input name="q" value="${esc(q)}" class="form-control" placeholder="Name, phone or reservation #"></div><div class="col-md-3"><button class="btn btn-sv">Filter</button></div></form>
  <div class="card"><div class="table-responsive"><table class="table table-hover mb-0"><thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Pax</th><th>Event</th><th>Status</th></tr></thead><tbody>
  ${data.map((r) => `<tr class="clickable" onclick="location.hash='#/reservation/${r.id}'"><td>${esc(r.reservation_number)}</td><td>${esc(r.customer_name)}<br><small class="text-muted">${esc(r.phone || '')}</small></td><td>${dOnly(r.date)} ${tm(r.time)}</td><td>${r.pax}</td><td>${esc(r.event_type || '')}</td><td>${badge(r.status)}</td></tr>`).join('') || '<tr><td colspan=6 class="p-3 text-muted">No reservations.</td></tr>'}
  </tbody></table></div></div>${pager(count || 0, page, 25, `#/reservations?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&page=`)}`;
}

export async function calendar(el) {
  const month = hashParams().get('m') || today().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const data = await run(sb.from('reservations').select('id,customer_name,pax,date,time,status').gte('date', `${month}-01`).lte('date', `${month}-${String(days).padStart(2, '0')}`).order('time'));
  const col = { Reserved: 'warning', Confirmed: 'success', 'Checked In': 'primary', Completed: 'success', Cancelled: 'secondary', 'No Show': 'danger' };
  const shift = (d) => { const n = new Date(y, m - 1 + d, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };
  let cells = ''.padStart(first.getDay(), ' ').split('').map(() => '<td class="bg-light"></td>');
  for (let d = 1; d <= days; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    cells.push(`<td style="vertical-align:top;height:90px"><div class="small fw-bold">${d}</div>${data.filter((r) => r.date === key).map((r) => `<a class="badge bg-${col[r.status]} d-block text-start text-wrap mb-1" href="#/reservation/${r.id}">${tm(r.time)} ${esc(r.customer_name)} (${r.pax})</a>`).join('')}</td>`);
  }
  while (cells.length % 7) cells.push('<td class="bg-light"></td>');
  const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>${first.toLocaleString('en', { month: 'long', year: 'numeric' })}</h4><div class="btn-group">
    <a class="btn btn-outline-success" href="#/reservations/calendar?m=${shift(-1)}">‹</a><a class="btn btn-outline-success" href="#/reservations/calendar?m=${shift(1)}">›</a><a class="btn btn-outline-secondary" href="#/reservations">List</a></div></div>
    <div class="card"><table class="table table-bordered mb-0" style="table-layout:fixed"><thead><tr>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export async function create(el) {
  el.innerHTML = `<h4 class="mb-3">New reservation</h4><form id="f" class="card card-body"><div class="row g-3">
    <div class="col-md-6"><label class="form-label">Customer name *</label><input name="customer_name" class="form-control" required></div>
    <div class="col-md-3"><label class="form-label">Phone</label><input name="phone" class="form-control"></div><div class="col-md-3"><label class="form-label">Email</label><input name="email" type="email" class="form-control"></div>
    <div class="col-md-3"><label class="form-label">Date *</label><input name="date" type="date" min="${today()}" class="form-control" required></div>
    <div class="col-md-3"><label class="form-label">Time *</label><input name="time" type="time" class="form-control" required></div>
    <div class="col-md-3"><label class="form-label">Guests *</label><input name="pax" type="number" min="1" value="10" class="form-control" required></div>
    <div class="col-md-3"><label class="form-label">Event</label><input name="event_type" class="form-control" placeholder="Birthday, wedding…"></div>
    <div class="col-md-3"><label class="form-label">Down payment</label><input name="down_payment" type="number" min="0" step="0.01" value="0" class="form-control"></div>
    <div class="col-md-3"><label class="form-label">Method</label><select name="payment_method" class="form-select">${opt(METHODS)}</select></div>
    <div class="col-md-3"><label class="form-label">Reference #</label><input name="reference_number" class="form-control"></div>
    <div class="col-md-3"><label class="form-label">Proof of payment</label><input id="proof" type="file" accept="image/*,.pdf" class="form-control"></div>
    <div class="col-md-6"><label class="form-label">Inquiry #</label><input name="inquiry_number" class="form-control"></div><div class="col-md-6"><label class="form-label">Assigned staff</label><input name="assigned_staff" class="form-control"></div>
    <div class="col-12"><label class="form-label">Special requests</label><textarea name="special_requests" class="form-control" rows="2"></textarea></div></div>
    <button class="btn btn-sv mt-3 align-self-start">Create reservation</button></form>`;
  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(e.target)); f.pax = +f.pax; f.down_payment = num(f.down_payment);
      const id = await rpc('create_reservation', { p: f });
      const file = el.querySelector('#proof').files[0];
      if (file) { const path = await uploadProof(file, 'reservations'); await run(sb.from('reservation_attachments').insert({ reservation_id: id, file_path: path })); }
      toast('Reservation created.'); location.hash = '#/reservation/' + id;
    } catch (err) { toast(err.message, 'danger'); btn.disabled = false; }
  };
}

export async function detail(el, { id }) {
  const r = await run(sb.from('reservations').select('*, reservation_payments(*), reservation_attachments(*)').eq('id', id).maybeSingle());
  if (!r) { el.innerHTML = '<h4>Reservation not found</h4>'; return; }
  const verified = r.reservation_payments.filter((p) => p.status === 'Verified').reduce((a, p) => a + num(p.amount), 0);
  const act = (a, label, cls, show) => (show ? `<button class="btn btn-${cls}" data-act="${a}">${label}</button>` : '');
  el.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h4>${esc(r.reservation_number)} ${badge(r.status)}</h4><div class="d-flex gap-2 flex-wrap">
    ${act('confirm', 'Confirm', 'success', r.status === 'Reserved')}${act('checkin', 'Check in', 'primary', r.status === 'Confirmed')}
    ${r.status === 'Checked In' ? `<a class="btn btn-sv" href="#/reservation/${r.id}/billing">Final billing</a>` : ''}
    ${act('no_show', 'No show', 'outline-danger', ['Reserved', 'Confirmed'].includes(r.status))}${act('cancel', 'Cancel', 'outline-secondary', ['Reserved', 'Confirmed'].includes(r.status))}</div></div>
  ${r.billing_requires_approval ? '<div class="alert alert-warning">Final bill is waiting for admin approval (see Approvals).</div>' : ''}
  <div class="row g-3"><div class="col-lg-6"><div class="card"><div class="card-body">
    <div><strong>${esc(r.customer_name)}</strong> · ${esc(r.phone || '')} ${esc(r.email || '')}</div><div>${dOnly(r.date)} at ${tm(r.time)} · ${r.pax} guests${r.actual_pax ? ` (actual ${r.actual_pax})` : ''}</div>
    <div>Event: ${esc(r.event_type || '—')}</div><div>Assigned: ${esc(r.assigned_staff || '—')}</div><div>Inquiry #: ${esc(r.inquiry_number || '—')}</div>
    ${r.confirmed_by ? `<div>Confirmed by ${esc(r.confirmed_by)} on ${dt(r.date_confirmed)}</div>` : ''}${r.arrival_time ? `<div>Arrived ${dt(r.arrival_time)}</div>` : ''}
    <div class="mt-2"><em>${esc(r.special_requests || '')}</em></div>
    ${r.status === 'Completed' ? `<hr><div>Total bill: <strong>${peso(r.total_bill)}</strong></div><div>Remaining balance: ${peso(r.remaining_balance)}</div>` : ''}</div></div></div>
  <div class="col-lg-6"><div class="card"><div class="card-header">Payments <span class="float-end">Verified: ${peso(verified)}</span></div><table class="table mb-0"><tbody>
    ${r.reservation_payments.map((p) => `<tr><td>${esc(p.payment_type.replace('_', ' '))}<br><small class="text-muted">${esc(p.method)} ${esc(p.reference_number || '')}</small></td><td>${peso(p.amount)}</td><td>${badge(p.status)}</td>
      <td>${isAdmin() && p.status === 'Pending' ? `<button class="btn btn-sm btn-success" data-pay="${p.id}|Verified">Verify</button> <button class="btn btn-sm btn-outline-danger" data-pay="${p.id}|Rejected">Reject</button>` : ''}</td></tr>`).join('') || '<tr><td class="text-muted p-3">No payments recorded.</td></tr>'}
    </tbody></table>
    <div class="card-body border-top"><strong>Attachments</strong>${r.reservation_attachments.map((a) => `<div><a href="#" data-proof="${esc(a.file_path)}">View proof</a></div>`).join('') || '<div class="text-muted small">None</div>'}
    <input type="file" id="up" accept="image/*,.pdf" class="form-control form-control-sm mt-2"></div></div></div></div>`;
  on(el, 'click', '[data-act]', async (e, t) => {
    const a = t.dataset.act;
    if (a === 'checkin') return modal({ title: 'Check in', okText: 'Check in', body: `<label class="form-label">Actual guests</label><input name="pax" type="number" min="1" value="${r.pax}" class="form-control">`,
      onOk: async (f) => { await rpc('reservation_action', { p_id: r.id, p_action: 'checkin', p_actual_pax: +f.pax }); detail(el, { id }); } });
    if (['cancel', 'no_show'].includes(a)) return confirmBox(`Mark this reservation as ${a.replace('_', ' ')}?`, async () => { await rpc('reservation_action', { p_id: r.id, p_action: a }); detail(el, { id }); });
    await rpc('reservation_action', { p_id: r.id, p_action: a }); toast('Updated.'); detail(el, { id });
  });
  on(el, 'click', '[data-pay]', async (e, t) => { const [pid, st] = t.dataset.pay.split('|'); await rpc('verify_reservation_payment', { p_payment: +pid, p_status: st }); detail(el, { id }); });
  on(el, 'click', '[data-proof]', async (e, t) => { e.preventDefault(); window.open(await signedUrl(t.dataset.proof), '_blank', 'noopener'); });
  on(el, 'change', '#up', async (e, t) => { const path = await uploadProof(t.files[0], 'reservations'); if (path) { await run(sb.from('reservation_attachments').insert({ reservation_id: r.id, file_path: path })); toast('Uploaded.'); detail(el, { id }); } });
}

export async function billing(el, { id }) {
  const r = await run(sb.from('reservations').select('*, reservation_payments(*)').eq('id', id).maybeSingle());
  if (!r || r.status !== 'Checked In') { el.innerHTML = '<div class="alert alert-warning">Only a Checked In reservation can be billed.</div><a href="#/reservations">Back</a>'; return; }
  const dp = r.reservation_payments.filter((p) => p.status === 'Verified').reduce((a, p) => a + num(p.amount), 0);
  const pend = r.reservation_payments.filter((p) => p.status === 'Pending').reduce((a, p) => a + num(p.amount), 0);
  const guests = r.actual_pax || r.pax;
  const tier = await run(sb.from('buffet_tiers').select('price, products!inner(is_buffet,available)').eq('tier', 'adult').eq('products.is_buffet', true).eq('products.available', true).limit(1));
  const std = num(tier[0]?.price);
  el.innerHTML = `<h4 class="mb-3">Final billing — ${esc(r.reservation_number)}</h4><div class="card card-body" style="max-width:560px">
    <div>${esc(r.customer_name)} · ${guests} guests</div><div>Verified down payment: <strong>${peso(dp)}</strong>${pend ? ` <span class="text-warning small">(+${peso(pend)} pending verification — not counted)</span>` : ''}</div>
    ${std ? `<div class="text-muted small">Standard adult rate ${peso(std)} × ${guests} = ${peso(std * guests)}</div>` : ''}
    <form id="f" class="mt-3"><label class="form-label">Total bill</label><input name="total" type="number" step="0.01" min="0" value="${std ? (std * guests).toFixed(2) : ''}" class="form-control mb-2" required>
    <div class="small mb-2">Balance due after down payment: <strong id="bal">${peso(0)}</strong></div>
    <label class="form-label">Amount paid now</label><input name="paid" type="number" step="0.01" min="0" class="form-control mb-2" required>
    <label class="form-label">Method</label><select name="method" class="form-select mb-2">${opt([...METHODS, 'Mixed Payment'])}</select>
    <label class="form-label">Reference # (GCash / bank transfer)</label><input name="ref" class="form-control mb-3"><button class="btn btn-sv">Complete & bill</button></form></div>`;
  const upd = () => { const t = num(el.querySelector('[name=total]').value); el.querySelector('#bal').textContent = peso(Math.max(0, t - dp)); };
  el.querySelector('[name=total]').addEventListener('input', upd); upd();
  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(e.target));
      const res = await rpc('final_billing', { p_id: r.id, p_total: num(f.total), p_paid: num(f.paid), p_method: f.method, p_ref: f.ref });
      toast(res.requires_approval ? 'Total looks low — sent to an admin for approval.' : 'Reservation completed.', res.requires_approval ? 'warning' : 'success');
      location.hash = '#/sale/' + res.sale_id;
    } catch (err) { toast(err.message, 'danger'); btn.disabled = false; }
  };
}
