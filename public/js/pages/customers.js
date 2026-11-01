import { sb, esc, peso, dt, dOnly, tm, run, on, modal, badge, pager, toast, hashParams } from '../core.js';

export async function list(el) {
  const p = hashParams(); const page = Math.max(1, +p.get('page') || 1); const q = (p.get('q') || '').replace(/[,()%*]/g, ' ').trim();
  let qb = sb.from('customers').select('*', { count: 'exact' }).order('name');
  if (q) qb = qb.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, count, error } = await qb.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error(error.message);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Customers</h4><button class="btn btn-sv" id="add">+ Add customer</button></div>
  <form class="mb-3 d-flex gap-2" onsubmit="location.hash='#/customers?q='+encodeURIComponent(this.q.value);return false"><input name="q" value="${esc(q)}" class="form-control" placeholder="Search"><button class="btn btn-sv">Search</button></form>
  <div class="card"><table class="table table-hover mb-0"><thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead><tbody>
  ${data.map((c) => `<tr class="clickable" onclick="location.hash='#/customer/${c.id}'"><td>${esc(c.name)}</td><td>${esc(c.phone || '')}</td><td>${esc(c.email || '')}</td></tr>`).join('') || '<tr><td colspan=3 class="p-3 text-muted">No customers.</td></tr>'}</tbody></table></div>
  ${pager(count || 0, page, 25, `#/customers?q=${encodeURIComponent(q)}&page=`)}`;
  on(el, 'click', '#add', () => modal({ title: 'Add customer', body: ['name:Name', 'phone:Phone', 'email:Email', 'preferred_events:Preferred events'].map((x) => { const [k, l] = x.split(':'); return `<label class="form-label">${l}</label><input name="${k}" class="form-control mb-2" ${k === 'name' ? 'required' : ''}>`; }).join('') + '<label class="form-label">Notes</label><textarea name="notes" class="form-control"></textarea>',
    onOk: async (f) => { await run(sb.from('customers').insert(f)); toast('Customer added.'); list(el); } }));
}

export async function detail(el, { id }) {
  const c = await run(sb.from('customers').select('*, sales(id,sale_number,total,status,created_at), reservations(id,reservation_number,date,time,pax,status)').eq('id', id).maybeSingle());
  if (!c) { el.innerHTML = '<h4>Not found</h4>'; return; }
  el.innerHTML = `<h4>${esc(c.name)}</h4><p class="text-muted">${esc(c.phone || '')} ${esc(c.email || '')} ${c.preferred_events ? '· Prefers: ' + esc(c.preferred_events) : ''}<br>${esc(c.notes || '')}</p>
  <div class="row g-3"><div class="col-md-6"><div class="card"><div class="card-header">Sales</div><ul class="list-group list-group-flush">${c.sales.map((s) => `<li class="list-group-item"><a href="#/sale/${s.id}">${esc(s.sale_number)}</a> · ${peso(s.total)} ${badge(s.status)}<br><small>${dt(s.created_at)}</small></li>`).join('') || '<li class="list-group-item text-muted">None</li>'}</ul></div></div>
  <div class="col-md-6"><div class="card"><div class="card-header">Reservations</div><ul class="list-group list-group-flush">${c.reservations.map((r) => `<li class="list-group-item"><a href="#/reservation/${r.id}">${esc(r.reservation_number)}</a> · ${dOnly(r.date)} ${tm(r.time)} · ${r.pax} pax ${badge(r.status)}</li>`).join('') || '<li class="list-group-item text-muted">None</li>'}</ul></div></div></div>`;
}
