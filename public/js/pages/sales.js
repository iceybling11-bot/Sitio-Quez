import { sb, state, esc, peso, dt, num, run, rpc, on, modal, confirmBox, badge, pager, isAdmin, toast, signedUrl, PAGE_SIZE, hashParams } from '../core.js';

const SALE_SELECT = '*, sale_items(*), sale_payments(*), sale_refunds(*), sale_attachments(*), cashier:profiles!cashier_id(name,username), table:restaurant_tables!table_id(name), reservation:reservations!reservation_id(reservation_number)';

export async function printReceipt(saleId) {
  const s = await run(sb.from('sales').select(SALE_SELECT).eq('id', saleId).single());
  const paid = s.sale_payments.reduce((a, p) => a + num(p.amount), 0), refunded = s.sale_refunds.reduce((a, r) => a + num(r.amount), 0);
  const row = (l, r) => `<div class="row2"><span>${l}</span><span>${r}</span></div>`;
  const items = s.sale_items.map((i) => {
    const bd = [['Adult', i.buffet_adult], ['Senior', i.buffet_senior], ['PWD', i.buffet_pwd], ['Kids', i.buffet_kids], ['Free', i.buffet_free]].filter((x) => x[1]).map((x) => `${x[0]} x${x[1]}`).join(', ');
    return row(`${esc(i.product_name)}${i.is_buffet ? ' (Buffet)' : ''} x${i.quantity}`, num(i.line_total).toFixed(2)) + (bd ? `<div><em>${bd}</em></div>` : '');
  }).join('');
  const area = document.getElementById('print-area');
  area.innerHTML = `<div class="receipt"><div style="text-align:center"><strong>${esc(state.settings.restaurant_name || 'Sitio Verde')}</strong><br>SALES RECEIPT (Customer Copy)</div><hr>
    ${row('Receipt #', esc(s.sale_number))}${s.reservation ? row('Reservation #', esc(s.reservation.reservation_number)) : ''}${row('Date', dt(s.created_at))}
    ${row('Cashier', esc(s.cashier?.name || s.cashier?.username || 'N/A'))}${row('Customer', esc(s.customer_name || 'Walk-in'))}
    ${s.table ? row('Table', esc(s.table.name)) : ''}${s.queue_number ? row('Queue #', esc(s.queue_number)) : ''}<hr>
    ${items}<hr>${row('Subtotal', 'PHP ' + num(s.subtotal).toFixed(2))}
    ${num(s.discount) ? row(`Discount (${esc(s.discount_type)})`, '-PHP ' + num(s.discount).toFixed(2)) : ''}
    ${num(s.senior_pwd_savings) ? row('Senior/PWD savings', 'PHP ' + num(s.senior_pwd_savings).toFixed(2)) : ''}
    <div class="row2"><strong>TOTAL</strong><strong>PHP ${num(s.total).toFixed(2)}</strong></div>
    ${s.sale_payments.map((p) => row(esc(p.method) + (p.reference_number ? ` (${esc(p.reference_number)})` : ''), 'PHP ' + num(p.amount).toFixed(2))).join('')}
    ${refunded ? row('Refunded', '-PHP ' + refunded.toFixed(2)) + row('Net paid', 'PHP ' + (paid - refunded).toFixed(2)) : ''}
    ${num(s.amount_tendered) ? row('Tendered', 'PHP ' + num(s.amount_tendered).toFixed(2)) + row('Change', 'PHP ' + num(s.change).toFixed(2)) : ''}
    ${s.status === 'voided' ? '<hr><div style="text-align:center"><strong>*** VOIDED ***</strong></div>' : ''}
    <hr><div style="text-align:center"><em>${esc(state.settings.receipt_footer || 'Thank you for dining with us!')}</em></div></div>`;
  area.classList.remove('d-none');
  window.print();
  setTimeout(() => area.classList.add('d-none'), 500);
}

export async function history(el) {
  const p = hashParams(); const page = Math.max(1, +p.get('page') || 1); const q = (p.get('q') || '').replace(/[,()%*]/g, ' ').trim();
  let qb = sb.from('sales').select('id,sale_number,customer_name,total,status,created_at,requires_approval', { count: 'exact' }).order('created_at', { ascending: false });
  if (q) qb = qb.or(`sale_number.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data, count, error } = await qb.range((page - 1) * 50, page * 50 - 1);
  if (error) throw new Error(error.message);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Sales History</h4>
    <form class="d-flex gap-2" onsubmit="location.hash='#/history?q='+encodeURIComponent(this.q.value);return false"><input name="q" value="${esc(q)}" class="form-control" placeholder="Search sale # or customer"><button class="btn btn-sv">Search</button></form></div>
    <div class="card"><div class="table-responsive"><table class="table table-hover mb-0"><thead><tr><th>Sale #</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${data.map((s) => `<tr class="clickable" onclick="location.hash='#/sale/${s.id}'"><td>${esc(s.sale_number)}</td><td>${esc(s.customer_name)}</td><td>${peso(s.total)}</td>
      <td>${badge(s.status)}${s.requires_approval && s.status === 'open' ? ' <small class="text-warning">needs approval</small>' : ''}</td><td>${dt(s.created_at)}</td></tr>`).join('') || '<tr><td colspan=5 class="text-muted p-3">No sales found.</td></tr>'}
    </tbody></table></div></div>${pager(count || 0, page, 50, `#/history?q=${encodeURIComponent(q)}&page=`)}`;
}

export async function detail(el, { id }) {
  const s = await run(sb.from('sales').select(SALE_SELECT).eq('id', id).maybeSingle());
  if (!s) { el.innerHTML = '<h4>Sale not found</h4>'; return; }
  const paid = s.sale_payments.reduce((a, p) => a + num(p.amount), 0), refunded = s.sale_refunds.reduce((a, r) => a + num(r.amount), 0);
  el.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h4>Sale ${esc(s.sale_number)} ${badge(s.status)}</h4>
    <div class="d-flex gap-2"><button class="btn btn-outline-secondary" id="pr"><i class="bi bi-printer"></i> Receipt</button>
    ${isAdmin() && s.status !== 'voided' ? '<button class="btn btn-outline-warning" id="rf">Refund</button><button class="btn btn-outline-danger" id="vd">Void</button>' : ''}
    ${isAdmin() && s.status === 'open' && s.requires_approval ? '<button class="btn btn-success" id="ap">Approve</button>' : ''}</div></div>
  <div class="row g-3"><div class="col-lg-7"><div class="card mb-3"><div class="card-header">Items</div><table class="table mb-0"><tbody>
    ${s.sale_items.map((i) => `<tr><td>${esc(i.product_name)}${i.is_buffet ? `<br><small class="text-muted">Adult ${i.buffet_adult} · Senior ${i.buffet_senior} · PWD ${i.buffet_pwd} · Kids ${i.buffet_kids} · Free ${i.buffet_free}</small>` : ''}</td><td>x${i.quantity}</td><td class="text-end">${peso(i.line_total)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="card"><div class="card-header">Payments</div><table class="table mb-0"><tbody>
    ${s.sale_payments.map((p) => `<tr><td>${esc(p.method)} ${esc(p.reference_number || '')}</td><td class="text-end">${peso(p.amount)}</td></tr>`).join('')}
    ${s.sale_refunds.map((r) => `<tr class="text-danger"><td>${r.refund_type === 'void' ? 'Void refund' : 'Refund'}: ${esc(r.reason)}</td><td class="text-end">-${peso(r.amount)}</td></tr>`).join('')}
    <tr class="fw-bold"><td>Net paid</td><td class="text-end">${peso(paid - refunded)}</td></tr></tbody></table></div></div>
  <div class="col-lg-5"><div class="card"><div class="card-body">
    <div>Customer: <strong>${esc(s.customer_name || 'Walk-in')}</strong></div><div>Cashier: ${esc(s.cashier?.name || s.cashier?.username || '—')}</div>
    <div>Date: ${dt(s.created_at)}</div>${s.table ? `<div>Table: ${esc(s.table.name)}</div>` : ''}${s.queue_number ? `<div>Queue: ${esc(s.queue_number)}</div>` : ''}
    ${s.reservation ? `<div>Reservation: <a href="#/reservation/${s.reservation_id}">${esc(s.reservation.reservation_number)}</a></div>` : ''}
    <hr><div>Subtotal: ${peso(s.subtotal)}</div><div>Discount: ${peso(s.discount)} (${esc(s.discount_type)})</div>
    <div>Senior/PWD savings: ${peso(s.senior_pwd_savings)}</div><div class="fs-5 fw-bold">Total: ${peso(s.total)}</div>
    ${s.void_reason ? `<div class="text-danger mt-2">Void reason: ${esc(s.void_reason)}</div>` : ''}
    ${s.sale_attachments.length ? '<hr><strong>Proof of payment</strong>' + s.sale_attachments.map((a) => `<div><a href="#" data-proof="${esc(a.file_path)}">View attachment</a></div>`).join('') : ''}
  </div></div></div></div>`;
  el.querySelector('#pr').onclick = () => printReceipt(s.id).catch((e) => toast(e.message, 'danger'));
  on(el, 'click', '[data-proof]', async (e, t) => { e.preventDefault(); window.open(await signedUrl(t.dataset.proof), '_blank', 'noopener'); });
  el.querySelector('#ap')?.addEventListener('click', () => confirmBox(`Approve sale ${s.sale_number}?`, async () => { await rpc('approve_sale', { p_sale: s.id }); toast('Sale approved.'); detail(el, { id }); }, 'Approve'));
  el.querySelector('#vd')?.addEventListener('click', () => modal({ title: `Void ${s.sale_number}`, okText: 'Void sale', okClass: 'btn-danger',
    body: '<label class="form-label">Reason</label><input name="reason" class="form-control" required><p class="small text-muted mt-2">Stock is returned to inventory and the money collected is recorded as refunded.</p>',
    onOk: async (f) => { await rpc('void_sale', { p_sale: s.id, p_reason: f.reason }); toast('Sale voided.'); detail(el, { id }); } }));
  el.querySelector('#rf')?.addEventListener('click', () => modal({ title: 'Partial refund', okText: 'Refund',
    body: `<label class="form-label">Amount (max ${peso(paid - refunded)})</label><input name="amount" type="number" step="0.01" min="0.01" class="form-control mb-2" required>
      <label class="form-label">Reason</label><input name="reason" class="form-control mb-2" required><label class="form-label">Returned via</label><select name="method" class="form-select"><option>Cash</option><option>GCash</option><option>Credit Card</option></select>`,
    onOk: async (f) => { await rpc('refund_sale', { p_sale: s.id, p_amount: num(f.amount), p_reason: f.reason, p_method: f.method }); toast('Refund recorded.'); detail(el, { id }); } }));
}

export async function approvals(el) {
  const pending = await run(sb.from('sales').select('id,sale_number,customer_name,total,discount,subtotal,created_at,cashier:profiles!cashier_id(name,username)').eq('requires_approval', true).eq('status', 'open').order('created_at'));
  el.innerHTML = `<h4 class="mb-3">Pending approvals</h4><div class="card"><table class="table mb-0"><thead><tr><th>Sale</th><th>Customer</th><th>Subtotal</th><th>Discount</th><th>Total</th><th>Cashier</th><th></th></tr></thead><tbody>
    ${pending.map((s) => `<tr><td><a href="#/sale/${s.id}">${esc(s.sale_number)}</a></td><td>${esc(s.customer_name)}</td><td>${peso(s.subtotal)}</td><td>${peso(s.discount)}</td><td>${peso(s.total)}</td><td>${esc(s.cashier?.name || s.cashier?.username || '')}</td>
      <td><button class="btn btn-sm btn-success" data-ap="${s.id}">Approve</button> <button class="btn btn-sm btn-outline-danger" data-vd="${s.id}">Reject (void)</button></td></tr>`).join('') || '<tr><td colspan=7 class="text-muted p-3">Nothing waiting.</td></tr>'}</tbody></table></div>`;
  on(el, 'click', '[data-ap]', async (e, t) => { await rpc('approve_sale', { p_sale: +t.dataset.ap }); toast('Approved.'); approvals(el); });
  on(el, 'click', '[data-vd]', (e, t) => modal({ title: 'Reject sale', okText: 'Void', okClass: 'btn-danger', body: '<label class="form-label">Reason</label><input name="reason" class="form-control" required>',
    onOk: async (f) => { await rpc('void_sale', { p_sale: +t.dataset.vd, p_reason: f.reason }); toast('Sale voided.'); approvals(el); } }));
}
