import { sb, esc, peso, dt, num, run, rpc, on, modal, badge, pager, toast, hashParams } from '../core.js';

export async function list(el) {
  const [items, suppliers] = await Promise.all([run(sb.from('inventory_items').select('*, suppliers(name)').order('name')), run(sb.from('suppliers').select('*').order('name'))]);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Inventory</h4><div class="d-flex gap-2"><a class="btn btn-outline-warning" href="#/inventory/low">Low stock</a><a class="btn btn-outline-success" href="#/inventory/suppliers">Suppliers</a><button class="btn btn-sv" id="add">+ Item</button></div></div>
  <div class="card"><div class="table-responsive"><table class="table mb-0"><thead><tr><th>Item</th><th>On hand</th><th>Low at</th><th>Supplier</th><th></th></tr></thead><tbody>
  ${items.map((i) => `<tr class="${num(i.quantity) <= num(i.low_stock_threshold) ? 'table-warning' : ''}"><td>${esc(i.name)}</td><td>${+num(i.quantity).toFixed(3)} ${esc(i.unit)}</td><td>${num(i.low_stock_threshold)}</td><td>${esc(i.suppliers?.name || '')}</td>
    <td class="text-end text-nowrap">${[['in', 'Stock in'], ['out', 'Stock out'], ['adjust', 'Adjust'], ['waste', 'Waste']].map(([o, l]) => `<button class="btn btn-sm btn-outline-secondary" data-op="${i.id}|${o}">${l}</button>`).join(' ')} <a class="btn btn-sm btn-light" href="#/inventory/${i.id}/history">History</a></td></tr>`).join('') || '<tr><td colspan=5 class="p-3 text-muted">No items.</td></tr>'}</tbody></table></div></div>`;
  on(el, 'click', '#add', () => modal({ title: 'Add inventory item', body: `<label class="form-label">Name</label><input name="name" class="form-control mb-2" required>
    <div class="row g-2"><div class="col"><label class="form-label">Quantity</label><input name="quantity" type="number" min="0" step="any" value="0" class="form-control"></div><div class="col"><label class="form-label">Unit</label><input name="unit" value="pcs" class="form-control"></div><div class="col"><label class="form-label">Low-stock at</label><input name="low" type="number" min="0" step="any" value="5" class="form-control"></div></div>
    <label class="form-label mt-2">Supplier</label><select name="supplier" class="form-select"><option value="">—</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`,
    onOk: async (f) => { await run(sb.from('inventory_items').insert({ name: f.name, quantity: num(f.quantity), unit: f.unit, low_stock_threshold: num(f.low), supplier_id: f.supplier || null })); toast('Item added.'); list(el); } }));
  on(el, 'click', '[data-op]', (e, t) => {
    const [id, op] = t.dataset.op.split('|'); const it = items.find((x) => x.id === +id);
    const label = { in: 'Stock in', out: 'Stock out', adjust: 'Set exact quantity', waste: 'Record waste / spoilage' }[op];
    modal({ title: `${label}: ${it.name}`, okText: 'Save', body: `<label class="form-label">${op === 'adjust' ? 'New quantity' : 'Quantity'} (${esc(it.unit)})</label><input name="qty" type="number" step="any" min="0" class="form-control mb-2" required>
      ${op === 'waste' ? '<label class="form-label">Type</label><select name="type" class="form-select mb-2"><option value="waste">Waste</option><option value="spoilage">Spoilage</option></select>' : ''}
      <label class="form-label">${op === 'waste' ? 'Reason (required)' : 'Note'}</label><input name="note" class="form-control" ${op === 'waste' ? 'required' : ''}>`,
      onOk: async (f) => { await rpc('inventory_op', { p_item: it.id, p_op: op === 'waste' ? f.type : op, p_qty: num(f.qty), p_note: f.note || '' }); toast('Inventory updated.'); list(el); } });
  });
}

export async function low(el) {
  const all = await run(sb.from('inventory_items').select('*').order('name'));
  const items = all.filter((i) => num(i.quantity) <= num(i.low_stock_threshold));
  el.innerHTML = `<h4 class="mb-3">Low stock</h4><div class="card"><table class="table mb-0"><tbody>${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${+num(i.quantity).toFixed(3)} ${esc(i.unit)} left (alert at ${num(i.low_stock_threshold)})</td></tr>`).join('') || '<tr><td class="p-3 text-muted">Everything is above its threshold.</td></tr>'}</tbody></table></div><a href="#/inventory" class="d-block mt-3">← Inventory</a>`;
}

export async function suppliers(el) {
  const data = await run(sb.from('suppliers').select('*').order('name'));
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Suppliers</h4><button class="btn btn-sv" id="add">+ Supplier</button></div><div class="card"><table class="table mb-0"><tbody>${data.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.contact || '')}</td></tr>`).join('') || '<tr><td class="p-3 text-muted">None.</td></tr>'}</tbody></table></div><a href="#/inventory" class="d-block mt-3">← Inventory</a>`;
  on(el, 'click', '#add', () => modal({ title: 'Add supplier', body: '<label class="form-label">Name</label><input name="name" class="form-control mb-2" required><label class="form-label">Contact</label><input name="contact" class="form-control">',
    onOk: async (f) => { await run(sb.from('suppliers').insert(f)); suppliers(el); } }));
}

export async function history(el, { id }) {
  const page = Math.max(1, +hashParams().get('page') || 1);
  const [item, r] = await Promise.all([run(sb.from('inventory_items').select('*').eq('id', id).maybeSingle()),
    sb.from('inventory_transactions').select('*, profiles(name,username)', { count: 'exact' }).eq('item_id', id).order('created_at', { ascending: false }).range((page - 1) * 50, page * 50 - 1)]);
  if (r.error) throw new Error(r.error.message);
  el.innerHTML = `<h4 class="mb-3">${esc(item?.name || 'Item')} — history</h4><div class="card"><div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>When</th><th>Type</th><th>Qty</th><th>Note</th><th>By</th></tr></thead><tbody>
  ${r.data.map((t) => `<tr><td>${dt(t.created_at)}</td><td>${badge(t.type)}</td><td>${+num(t.quantity).toFixed(3)}</td><td>${esc(t.note || '')}</td><td>${esc(t.profiles?.name || t.profiles?.username || '')}</td></tr>`).join('')}</tbody></table></div></div>
  ${pager(r.count || 0, page, 50, `#/inventory/${id}/history?page=`)}<a href="#/inventory" class="d-block mt-3">← Inventory</a>`;
}
