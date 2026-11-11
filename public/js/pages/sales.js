import { sb, state, esc, peso, dt, num, run, rpc, on, modal, confirmBox, badge, pager, isAdmin, toast, signedUrl, hashParams, downloadCSV } from '../core.js';
import { fetchAll } from './finance.js';

const SALE_SELECT = '*, sale_items(*), sale_payments(*), sale_refunds(*), sale_attachments(*), cashier:profiles!cashier_id(name,username), reservation:reservations!reservation_id(reservation_number)';

const money = (n) => num(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIERS = [['adult', 'Adult', 'buffet_adult'], ['senior', 'Senior', 'buffet_senior'], ['pwd', 'PWD', 'buffet_pwd'], ['kids', 'Kids', 'buffet_kids'], ['free', 'Free', 'buffet_free']];
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

export async function printReceipt(saleId) {
  const s = await run(sb.from('sales').select(SALE_SELECT).eq('id', saleId).single());
  const paid = s.sale_payments.reduce((a, p) => a + num(p.amount), 0), refunded = s.sale_refunds.reduce((a, r) => a + num(r.amount), 0);
  const row = (l, r) => `<div class="row2"><span>${l}</span><span>${r}</span></div>`;

  // The sale stores guest counts and the line total, not each category's unit price, so read the package's current
  // tier prices and use them only if they add up to what was actually charged (otherwise fall back to counts only).
  const tierPrices = {};
  for (const pid of new Set(s.sale_items.filter((i) => i.is_buffet && i.product_id).map((i) => i.product_id))) {
    try { tierPrices[pid] = Object.fromEntries((await run(sb.from('buffet_tiers').select('tier,price').eq('product_id', pid))).map((t) => [t.tier, num(t.price)])); } catch { /* counts only */ }
  }
  const items = s.sale_items.map((i) => {
    const head = row(`${esc(i.product_name)}${i.is_buffet ? ' (Buffet)' : ''}`, i.is_buffet ? '' : `x${i.quantity} ${money(i.line_total)}`);
    if (!i.is_buffet) return head;
    const tp = tierPrices[i.product_id];
    const cats = TIERS.filter(([, , col]) => num(i[col]) > 0);
    const priced = tp && Math.abs(cats.reduce((a, [k, , col]) => a + (k === 'free' ? 0 : tp[k] * num(i[col])), 0) - num(i.line_total)) < 0.015;
    const lines = priced
      ? cats.map(([k, label, col]) => { const u = k === 'free' ? 0 : tp[k]; return row(`${label} ${i[col]} x ${money(u)}`, money(u * num(i[col]))); }).join('')
      : cats.map(([, label, col]) => `<div>${label} x${i[col]}</div>`).join('') + row('Package total', money(i.line_total));
    return head + lines;
  }).join('');

  const remaining = Math.max(0, num(s.total) - paid);
  const change = Math.max(0, num(s.change) || paid - num(s.total));
  const area = document.getElementById('print-area');
  area.innerHTML = `<div class="receipt"><div style="text-align:center"><strong>${esc(state.settings.restaurant_name || 'Sitio Verde')}</strong><br>SALES RECEIPT (Customer Copy)</div><hr>
    ${row('Receipt #', esc(s.sale_number))}${s.reservation ? row('Reservation #', esc(s.reservation.reservation_number)) : ''}${row('Date', dt(s.created_at))}
    ${row('Cashier', esc(s.cashier?.name || s.cashier?.username || 'N/A'))}${row('Customer', esc(s.customer_name || 'Walk-in'))}
    ${s.queue_number ? row('Queue #', esc(s.queue_number)) : ''}<hr>
    ${items}<hr>${row('Subtotal', 'PHP ' + money(s.subtotal))}
    ${num(s.discount) ? row(`Discount (${esc(s.discount_type)})`, '-PHP ' + money(s.discount)) : ''}
    ${num(s.senior_pwd_savings) ? row('Senior/PWD savings', 'PHP ' + money(s.senior_pwd_savings)) : ''}
    <div class="row2"><strong>TOTAL</strong><strong>PHP ${money(s.total)}</strong></div><hr>
    ${s.sale_payments.map((p) => row(esc(p.method) + (p.reference_number ? ` (${esc(p.reference_number)})` : ''), 'PHP ' + money(p.amount))).join('')}
    ${row('Total paid', 'PHP ' + money(paid))}
    ${remaining > 0.005 ? row('Remaining balance', 'PHP ' + money(remaining)) : ''}
    ${change > 0.005 ? row('Change', 'PHP ' + money(change)) : ''}
    ${refunded ? row('Refunded', '-PHP ' + money(refunded)) + row('Net paid', 'PHP ' + money(paid - refunded)) : ''}
    ${s.status === 'voided' ? '<hr><div style="text-align:center"><strong>*** VOIDED ***</strong></div>' : ''}
    <hr><div style="text-align:center"><em>${esc(state.settings.receipt_footer || 'Thank you for dining with us!')}</em></div></div>`;
  if (!area.textContent.trim()) throw new Error('Receipt is empty - nothing to print.');

  // Print CSS (style.css) shows #print-area only while printing and hides the rest of the page, so the receipt
  // stays in the DOM. Don't hide or clear it after print(): Android renders its preview after print() returns,
  // and removing the receipt at that point is what produced the blank preview.
  try { await Promise.race([document.fonts?.ready, settle(300)]); } catch { /* ignore */ }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // let layout finish first
  window.print();
}

export async function history(el) {
  const p = hashParams(); const page = Math.max(1, +p.get('page') || 1); const q = (p.get('q') || '').replace(/[,()%*]/g, ' ').trim();
  let qb = sb.from('sales').select('id,sale_number,customer_name,total,status,created_at,requires_approval', { count: 'exact' }).order('created_at', { ascending: false });
  if (q) qb = qb.or(`sale_number.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data, count, error } = await qb.range((page - 1) * 50, page * 50 - 1);
  if (error) throw new Error(error.message);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Sales History</h4>
    <form class="d-flex gap-2" onsubmit="location.hash='#/history?q='+encodeURIComponent(this.q.value);return false"><input name="q" value="${esc(q)}" class="form-control" placeholder="Search sale # or customer"><button class="btn btn-sv">Search</button></form></div>
    ${isAdmin() ? `<div class="mb-3 d-flex gap-2 flex-wrap"><button class="btn btn-outline-success btn-sm" id="dl"><i class="bi bi-download"></i> Download ${q ? 'matching sales' : 'all sales'} (CSV)</button><a class="btn btn-outline-secondary btn-sm" href="#/backup">More downloads &amp; reset</a></div>` : ''}
    <div class="card"><div class="table-responsive"><table class="table table-hover mb-0"><thead><tr><th>Sale #</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${data.map((s) => `<tr class="clickable" onclick="location.hash='#/sale/${s.id}'"><td>${esc(s.sale_number)}</td><td>${esc(s.customer_name)}</td><td>${peso(s.total)}</td>
      <td>${badge(s.status)}${s.requires_approval && s.status === 'open' ? ' <small class="text-warning">needs approval</small>' : ''}</td><td>${dt(s.created_at)}</td></tr>`).join('') || '<tr><td colspan=5 class="text-muted p-3">No sales found.</td></tr>'}
    </tbody></table></div></div>${pager(count || 0, page, 50, `#/history?q=${encodeURIComponent(q)}&page=`)}`;
  on(el, 'click', '#dl', async (e, t) => {
    t.disabled = true;
    try {
      const rows = await fetchAll('sales', 'sale_number,created_at,customer_name,queue_number,subtotal,discount,discount_type,senior_pwd_savings,total,amount_tendered,change,status,void_reason,sale_payments(method,amount,reference_number)',
        (b) => { let x = b.order('created_at', { ascending: false }); if (q) x = x.or(`sale_number.ilike.%${q}%,customer_name.ilike.%${q}%`); return x; });
      downloadCSV(`sales-${new Date().toISOString().slice(0, 10)}.csv`, [['Sale #', 'Date', 'Customer', 'Queue', 'Subtotal', 'Discount', 'Discount type', 'Senior/PWD savings', 'Total', 'Tendered', 'Change', 'Status', 'Void reason', 'Payments'],
        ...rows.map((r) => [r.sale_number, r.created_at, r.customer_name, r.queue_number, r.subtotal, r.discount, r.discount_type, r.senior_pwd_savings, r.total, r.amount_tendered, r.change, r.status, r.void_reason,
          r.sale_payments.map((p) => `${p.method} ${p.amount}${p.reference_number ? ' (' + p.reference_number + ')' : ''}`).join('; ')])]);
    } finally { t.disabled = false; }
  });
}

export async function detail(el, { id }) {
  const s = await run(sb.from('sales').select(SALE_SELECT).eq('id', id).maybeSingle());
  if (!s) { el.innerHTML = '<h4>Sale not found</h4>'; return; }
  const paid = s.sale_payments.reduce((a, p) => a + num(p.amount), 0), refunded = s.sale_refunds.reduce((a, r) => a + num(r.amount), 0);
  el.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h4>Sale ${esc(s.sale_number)} ${badge(s.status)}</h4>
    <div class="d-flex gap-2"><button class="btn btn-outline-secondary" id="pr"><i class="bi bi-printer"></i> Receipt</button>
    ${isAdmin() && s.status !== 'voided' ? '<button class="btn btn-outline-warning" id="rf">Refund</button><button class="btn btn-outline-danger" id="vd">Void</button>' : ''}
    ${isAdmin() ? '<button class="btn btn-danger" id="del"><i class="bi bi-trash"></i> Delete</button>' : ''}
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
    <div>Date: ${dt(s.created_at)}</div>${s.queue_number ? `<div>Queue: ${esc(s.queue_number)}</div>` : ''}
    ${s.reservation ? `<div>Reservation: <a href="#/reservation/${s.reservation_id}">${esc(s.reservation.reservation_number)}</a></div>` : ''}
    <hr><div>Subtotal: ${peso(s.subtotal)}</div><div>Discount: ${peso(s.discount)} (${esc(s.discount_type)})</div>
    <div>Senior/PWD savings: ${peso(s.senior_pwd_savings)}</div><div class="fs-5 fw-bold">Total: ${peso(s.total)}</div>
    ${s.void_reason ? `<div class="text-danger mt-2">Void reason: ${esc(s.void_reason)}</div>` : ''}
    ${s.sale_attachments.length ? '<hr><strong>Proof of payment</strong>' + s.sale_attachments.map((a) => `<div><a href="#" data-proof="${esc(a.file_path)}">View attachment</a></div>`).join('') : ''}
  </div></div></div></div>`;
  el.querySelector('#pr').onclick = () => printReceipt(s.id).catch((e) => toast(e.message, 'danger'));
  on(el, 'click', '[data-proof]', async (e, t) => { e.preventDefault(); window.open(await signedUrl(t.dataset.proof), '_blank', 'noopener'); });
  el.querySelector('#ap')?.addEventListener('click', () => confirmBox(`Approve sale ${s.sale_number}?`, async () => { await rpc('approve_sale', { p_sale: s.id }); toast('Sale approved.'); detail(el, { id }); }, 'Approve'));
  el.querySelector('#del')?.addEventListener('click', () => modal({ title: `Permanently delete ${s.sale_number}`, okText: 'Delete permanently', okClass: 'btn-danger',
    body: `<div class="alert alert-danger">This erases the sale, its payments, refunds and proof images, and returns any stock it used. It cannot be undone. To keep a record, use <strong>Void</strong> instead.</div>
      <label class="form-label">Type <strong>DELETE</strong> to confirm</label><input name="word" class="form-control" autocomplete="off" required>`,
    onOk: async (f) => {
      if (f.word !== 'DELETE') throw new Error('Type DELETE (in capitals) to confirm.');
      const paths = s.sale_attachments.map((a) => a.file_path);
      await rpc('delete_sale', { p_sale: s.id, p_confirm: f.word });
      if (paths.length) await sb.storage.from('proofs').remove(paths);
      toast('Sale deleted.'); location.hash = '#/history';
    } }));
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
