import { sb, state, esc, peso, dt, num, run, rpc, on, modal, confirmBox, badge, toast } from '../core.js';
import { fetchAll } from './finance.js';

const TIERS = [['adult', 'Adult'], ['senior', 'Senior'], ['pwd', 'PWD'], ['kids', 'Kids'], ['free', 'Free']];

export async function products(el) {
  const [prods, cats, inv] = await Promise.all([
    run(sb.from('products').select('*, categories(name), buffet_tiers(*), recipes(id, quantity_per_unit, inventory_item_id, inventory_items(name,unit))').order('id')),
    run(sb.from('categories').select('*').order('name')), run(sb.from('inventory_items').select('id,name,unit').order('name'))]);
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Menu / Products</h4><div class="d-flex gap-2"><button class="btn btn-outline-success" id="cat">+ Category</button><button class="btn btn-sv" id="add">+ Product</button></div></div>
  <div class="card"><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Product</th><th>Prices</th><th>Ingredients used per guest/unit</th><th></th></tr></thead><tbody>
  ${prods.map((p) => `<tr><td><strong>${esc(p.name)}</strong> ${p.is_buffet ? '<span class="badge badge-sv">buffet</span>' : ''} ${p.available ? '' : badge('voided').replace('voided', 'hidden')}<br><small class="text-muted">${esc(p.categories?.name || '')}</small></td>
    <td class="small">${p.is_buffet ? TIERS.map(([k, l]) => `${l}: ${peso(p.buffet_tiers.find((t) => t.tier === k)?.price)}`).join('<br>') : peso(p.selling_price)}</td>
    <td class="small">${p.recipes.map((r) => `${esc(r.inventory_items?.name)}: ${num(r.quantity_per_unit)} ${esc(r.inventory_items?.unit)} <a href="#" class="text-danger" data-rdel="${r.id}">✕</a>`).join('<br>') || '<span class="text-muted">none — stock not tracked</span>'}
      <br><a href="#" data-radd="${p.id}">+ ingredient</a></td>
    <td class="text-end text-nowrap"><button class="btn btn-sm btn-outline-secondary" data-edit="${p.id}">Edit</button> <button class="btn btn-sm btn-outline-danger" data-del="${p.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></div>`;

  const form = (p = {}) => `<label class="form-label">Name</label><input name="name" class="form-control mb-2" value="${esc(p.name || '')}" required>
    <div class="row g-2 mb-2"><div class="col"><label class="form-label">Category</label><select name="category_id" class="form-select"><option value="">—</option>${cats.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="col"><label class="form-label">Barcode</label><input name="barcode" class="form-control" value="${esc(p.barcode || '')}"></div></div>
    <div class="form-check"><input class="form-check-input" type="checkbox" name="is_buffet" id="ib" ${p.is_buffet ? 'checked' : ''}><label for="ib" class="form-check-label">Buffet package (uses guest-type pricing)</label></div>
    <div class="form-check mb-2"><input class="form-check-input" type="checkbox" name="available" id="av" ${p.available !== false ? 'checked' : ''}><label for="av" class="form-check-label">Available for sale</label></div>
    <div class="row g-2">${TIERS.map(([k, l]) => `<div class="col-4"><label class="form-label small">${l} price</label><input name="t_${k}" type="number" step="0.01" min="0" class="form-control form-control-sm" value="${p.buffet_tiers?.find((t) => t.tier === k)?.price ?? 0}"></div>`).join('')}
    <div class="col-4"><label class="form-label small">Regular price</label><input name="selling_price" type="number" step="0.01" min="0" class="form-control form-control-sm" value="${p.selling_price ?? 0}"></div></div>`;
  const save = async (f, id) => {
    const row = { name: f.name.trim(), category_id: f.category_id || null, barcode: f.barcode.trim() || null, is_buffet: !!f.is_buffet, available: !!f.available, selling_price: num(f.selling_price) };
    let pid = id;
    if (id) await run(sb.from('products').update(row).eq('id', id)); else pid = (await run(sb.from('products').insert(row).select('id').single())).id;
    if (row.is_buffet) await run(sb.from('buffet_tiers').upsert(TIERS.map(([k]) => ({ product_id: pid, tier: k, price: num(f['t_' + k]) })), { onConflict: 'product_id,tier' }));
    toast('Product saved.'); products(el);
  };
  on(el, 'click', '#add', () => modal({ title: 'Add product', body: form(), onOk: (f) => save(f) }));
  on(el, 'click', '[data-edit]', (e, t) => { const p = prods.find((x) => x.id === +t.dataset.edit); modal({ title: 'Edit product', body: form(p), onOk: (f) => save(f, p.id) }); });
  on(el, 'click', '[data-del]', (e, t) => confirmBox('Delete this product? Past sales keep their line items.', async () => { await run(sb.from('products').delete().eq('id', t.dataset.del)); products(el); }, 'Delete'));
  on(el, 'click', '#cat', () => modal({ title: 'Add category', body: '<input name="name" class="form-control" required>', onOk: async (f) => { await run(sb.from('categories').insert({ name: f.name })); products(el); } }));
  on(el, 'click', '[data-radd]', (e, t) => { e.preventDefault(); modal({ title: 'Add ingredient', body: `<label class="form-label">Inventory item</label><select name="item" class="form-select mb-2">${inv.map((i) => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('')}</select><label class="form-label">Quantity used per guest / unit sold</label><input name="qty" type="number" step="any" min="0.0001" class="form-control" required>`,
    onOk: async (f) => { await run(sb.from('recipes').insert({ product_id: +t.dataset.radd, inventory_item_id: +f.item, quantity_per_unit: num(f.qty) })); products(el); } }); });
  on(el, 'click', '[data-rdel]', async (e, t) => { e.preventDefault(); await run(sb.from('recipes').delete().eq('id', t.dataset.rdel)); products(el); });
}

async function adminCall(body) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch('/.netlify/functions/admin-users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

export async function users(el) {
  const data = await run(sb.from('profiles').select('*').order('created_at'));
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Staff accounts</h4><button class="btn btn-sv" id="add">+ Add staff</button></div>
  <div class="card"><table class="table align-middle mb-0"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
  ${data.map((u) => `<tr><td>${esc(u.name || '')}</td><td>${esc(u.username)}</td><td>${badge(u.role === 'admin' ? 'Confirmed' : 'Reserved').replace(/>.*</, `>${esc(u.role)}<`)}</td><td>${u.active ? 'Active' : '<span class="text-danger">Deactivated</span>'}${u.must_change_password ? ' <small class="text-muted">(must change password)</small>' : ''}</td>
    <td class="text-end text-nowrap">${u.id === state.profile.id ? '<small class="text-muted">you</small>' : `<button class="btn btn-sm btn-outline-secondary" data-reset="${u.id}">Reset password</button> <button class="btn btn-sm btn-outline-${u.active ? 'danger' : 'success'}" data-tog="${u.id}|${u.active}">${u.active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  on(el, 'click', '#add', () => modal({ title: 'Add staff account', okText: 'Create', body: `<label class="form-label">Full name</label><input name="name" class="form-control mb-2" required>
    <label class="form-label">Username</label><input name="username" class="form-control mb-2" required pattern="[A-Za-z0-9_.\\-]{3,30}"><label class="form-label">Email (used to log in)</label><input name="email" type="email" class="form-control mb-2" required>
    <label class="form-label">Temporary password (min 8)</label><input name="password" type="text" minlength="8" class="form-control mb-2" required><label class="form-label">Role</label><select name="role" class="form-select"><option value="staff">Staff / Cashier</option><option value="admin">Admin</option></select>
    <p class="small text-muted mt-2">They will be asked to choose their own password at first login.</p>`,
    onOk: async (f) => { await adminCall({ action: 'create', ...f }); toast('Account created.'); users(el); } }));
  on(el, 'click', '[data-reset]', (e, t) => modal({ title: 'Reset password', okText: 'Reset', body: '<label class="form-label">New temporary password (min 8)</label><input name="password" minlength="8" class="form-control" required>',
    onOk: async (f) => { await adminCall({ action: 'reset', user_id: t.dataset.reset, password: f.password }); toast('Password reset. They must change it at next login.'); users(el); } }));
  on(el, 'click', '[data-tog]', async (e, t) => { const [id, act] = t.dataset.tog.split('|'); await rpc('set_user_active', { p_user: id, p_active: act !== 'true' }); users(el); });
}

export async function settings(el) {
  const s = state.settings;
  el.innerHTML = `<h4 class="mb-3">Settings</h4><form id="f" class="card card-body" style="max-width:520px"><label class="form-label">Restaurant name</label><input name="restaurant_name" class="form-control mb-2" value="${esc(s.restaurant_name || '')}">
    <label class="form-label">Receipt footer</label><input name="receipt_footer" class="form-control mb-2" value="${esc(s.receipt_footer || '')}">
    <label class="form-label">Max discount % staff can apply without admin approval</label><input name="max_staff_discount_percent" type="number" min="0" max="100" class="form-control mb-3" value="${esc(s.max_staff_discount_percent || 10)}"><button class="btn btn-sv align-self-start">Save</button></form>`;
  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try { const f = Object.fromEntries(new FormData(e.target)); await run(sb.from('settings').upsert(Object.entries(f).map(([key, value]) => ({ key, value: String(value) })))); Object.assign(state.settings, f); toast('Settings saved. Reload to see the new name in the header.'); }
    catch (err) { toast(err.message, 'danger'); }
  };
}

export async function logs(el) {
  const data = await run(sb.from('activity_logs').select('*, profiles(name,username)').order('created_at', { ascending: false }).limit(300));
  el.innerHTML = `<h4 class="mb-3">Activity log</h4><div class="card"><div class="table-responsive"><table class="table table-sm mb-0"><tbody>${data.map((l) => `<tr><td class="text-nowrap">${dt(l.created_at)}</td><td>${esc(l.profiles?.name || l.profiles?.username || 'system')}</td><td>${esc(l.action)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

export async function backup(el) {
  el.innerHTML = `<h4 class="mb-3">Backup</h4><div class="card card-body" style="max-width:620px"><p>Downloads a JSON copy of your key business data (sales, reservations, customers, inventory, expenses, products).</p>
    <p class="text-muted small">This is a convenience export. For real disaster recovery, rely on Supabase's database backups (Project → Database → Backups; daily backups are on paid plans).</p><button class="btn btn-sv align-self-start" id="dl">Download JSON backup</button></div>`;
  on(el, 'click', '#dl', async (e, t) => {
    t.disabled = true;
    try {
      const names = ['customers', 'products', 'buffet_tiers', 'recipes', 'inventory_items', 'suppliers', 'sales', 'sale_items', 'sale_payments', 'sale_refunds', 'reservations', 'reservation_payments', 'expenses'];
      const out = { exported_at: new Date().toISOString() };
      for (const n of names) out[n] = await fetchAll(n, '*', (q) => q.order('id'));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      a.download = `sitio-verde-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    } finally { t.disabled = false; }
  });
}
