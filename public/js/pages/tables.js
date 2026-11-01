import { sb, esc, peso, dt, num, run, rpc, on, modal, confirmBox, badge, toast, isAdmin } from '../core.js';

export async function layout(el) {
  const tables = await run(sb.from('restaurant_tables').select('*').order('name'));
  const draw = () => {
    el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Tables</h4><div class="d-flex gap-2">
      <button class="btn btn-outline-success" id="merge">Merge selected</button>${isAdmin() ? '<button class="btn btn-sv" id="add">+ Add table</button>' : ''}</div></div>
    <div class="d-flex flex-wrap gap-3">${tables.map((t) => `<div class="text-center">
      <div class="table-tile table-${t.status} mx-auto" data-open="${t.id}" title="${esc(t.status)}">${esc(t.name)}</div>
      <small>${t.capacity} seats</small><br><input type="checkbox" class="form-check-input" data-sel="${t.id}"><br>
      <div class="dropdown"><button class="btn btn-sm btn-link p-0" data-bs-toggle="dropdown">options</button><ul class="dropdown-menu">
        ${t.session_id ? `<li><a class="dropdown-item" href="#/session/${t.session_id}">View tab</a></li><li><a class="dropdown-item" href="#/pos?table=${t.id}">Add order</a></li><li><a class="dropdown-item" href="#" data-transfer="${t.id}">Transfer…</a></li>` : ''}
        ${['available', 'reserved', 'cleaning'].map((s) => `<li><a class="dropdown-item" href="#" data-status="${t.id}|${s}">Mark ${s}</a></li>`).join('')}
      </ul></div></div>`).join('')}</div>
      <p class="text-muted mt-3 small">Click a table to seat guests / open its tab. Tick two or more tables and press Merge to combine them into one bill.</p>`;
  };
  draw();
  on(el, 'click', '[data-open]', async (e, t) => {
    const tb = tables.find((x) => x.id === +t.dataset.open);
    if (tb.session_id) { location.hash = '#/session/' + tb.session_id; return; }
    if (!['available', 'reserved'].includes(tb.status)) return toast(`${tb.name} is ${tb.status}. Mark it available first.`, 'warning');
    modal({ title: `Seat guests at ${tb.name}`, okText: 'Open table', body: `<label class="form-label">Guests</label><input name="pax" type="number" min="1" value="${tb.capacity}" class="form-control mb-2"><label class="form-label">Name</label><input name="name" class="form-control" placeholder="Walk-in">`,
      onOk: async (f) => { const sid = await rpc('open_table', { p_table: tb.id, p_pax: +f.pax, p_name: f.name }); location.hash = '#/session/' + sid; } });
  });
  on(el, 'click', '[data-status]', async (e, t) => { e.preventDefault(); const [id, s] = t.dataset.status.split('|'); await rpc('set_table_status', { p_table: +id, p_status: s }); layout(el); });
  on(el, 'click', '[data-transfer]', (e, t) => {
    e.preventDefault(); const src = +t.dataset.transfer;
    modal({ title: 'Transfer tab', okText: 'Transfer', body: `<label class="form-label">Move to</label><select name="dest" class="form-select">${tables.filter((x) => x.status === 'available').map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>`,
      onOk: async (f) => { await rpc('transfer_table', { p_source: src, p_dest: +f.dest }); toast('Transferred.'); layout(el); } });
  });
  on(el, 'click', '#merge', async () => {
    const ids = [...el.querySelectorAll('[data-sel]:checked')].map((c) => +c.dataset.sel);
    const sid = await rpc('merge_tables', { p_ids: ids }); toast('Tables merged.'); location.hash = '#/session/' + sid;
  });
  on(el, 'click', '#add', () => modal({ title: 'Add table', body: '<label class="form-label">Name</label><input name="name" class="form-control mb-2" required><label class="form-label">Capacity</label><input name="capacity" type="number" min="1" value="4" class="form-control">',
    onOk: async (f) => { await run(sb.from('restaurant_tables').insert({ name: f.name, capacity: +f.capacity })); layout(el); } }));
}

export async function session(el, { id }) {
  const s = await run(sb.from('dining_sessions').select('*, restaurant_tables(id,name), sales(*, sale_items(*), sale_payments(*), sale_refunds(*))').eq('id', id).maybeSingle());
  if (!s) { el.innerHTML = '<h4>Session not found</h4>'; return; }
  const sales = s.sales.filter((x) => x.status !== 'voided');
  const billed = sales.reduce((a, x) => a + num(x.total), 0);
  const paid = sales.reduce((a, x) => a + x.sale_payments.reduce((b, p) => b + num(p.amount), 0) - x.sale_refunds.reduce((b, r) => b + num(r.amount), 0), 0);
  const balance = Math.max(0, billed - paid), open = s.status === 'open';
  const tbl = s.restaurant_tables[0];
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Tab ${esc(s.session_number)} ${badge(s.status)}</h4>
    ${open && tbl ? `<a class="btn btn-sv" href="#/pos?table=${tbl.id}">+ Add order</a>` : ''}</div>
  <div class="row g-3"><div class="col-lg-8"><div class="card"><div class="card-header">Orders</div><table class="table mb-0"><thead><tr><th>Sale</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>
    ${s.sales.map((x) => `<tr><td><a href="#/sale/${x.id}">${esc(x.sale_number)}</a></td><td>${x.sale_items.map((i) => `${esc(i.product_name)} x${i.quantity} ${badge(i.kitchen_status)}`).join('<br>')}</td>
      <td>${peso(x.total)}</td><td>${peso(x.sale_payments.reduce((a, p) => a + num(p.amount), 0))}</td><td>${badge(x.status)}</td></tr>`).join('') || '<tr><td colspan=5 class="text-muted p-3">No orders yet.</td></tr>'}
    </tbody></table></div></div>
  <div class="col-lg-4"><div class="card"><div class="card-body"><div>Tables: <strong>${esc(s.restaurant_tables.map((t) => t.name).join(', ') || '—')}</strong></div>
    <div>Guests: ${s.pax} · ${esc(s.customer_name || '')}</div><div>Opened: ${dt(s.opened_at)}</div><hr>
    <div class="d-flex justify-content-between"><span>Billed</span><span>${peso(billed)}</span></div><div class="d-flex justify-content-between"><span>Paid</span><span>${peso(paid)}</span></div>
    <div class="d-flex justify-content-between fw-bold fs-5"><span>Balance</span><span>${peso(balance)}</span></div>
    ${open ? '<button class="btn btn-danger w-100 mt-3" id="close">Settle & close tab</button>' : `<div class="text-muted mt-2">Closed ${dt(s.closed_at)}</div>`}</div></div></div></div>`;
  el.querySelector('#close')?.addEventListener('click', () => modal({ title: 'Close tab', okText: 'Close tab', okClass: 'btn-danger',
    body: `<p>Remaining balance: <strong>${peso(balance)}</strong></p>${balance > 0 ? `<label class="form-label">Payment</label><input name="amount" type="number" step="0.01" value="${balance.toFixed(2)}" class="form-control mb-2"><label class="form-label">Method</label><select name="method" class="form-select"><option>Cash</option><option>GCash</option><option>Credit Card</option></select>` : '<p class="text-muted">Fully paid.</p>'}`,
    onOk: async (f) => { await rpc('close_session', { p_session: s.id, p_amount: num(f.amount), p_method: f.method || 'Cash' }); toast('Tab closed.'); location.hash = '#/tables'; } }));
}
