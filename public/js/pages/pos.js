import { sb, state, esc, peso, num, run, rpc, on, guard, toast, uploadProof, hashParams, isAdmin } from '../core.js';
import { printReceipt } from './sales.js';

export default async function (el) {
  const [products, tables] = await Promise.all([
    run(sb.from('products').select('*, buffet_tiers(*)').eq('is_buffet', true).eq('available', true).order('id')),
    run(sb.from('restaurant_tables').select('id,name,status,session_id').order('name')),
  ]);
  if (!products.length) { el.innerHTML = '<div class="alert alert-warning">No buffet package is set up yet. An admin can add one under Menu / Products.</div>'; return; }
  const pre = hashParams().get('table');
  const tier = (p, t) => num(p.buffet_tiers.find((x) => x.tier === t)?.price);

  el.innerHTML = `<h4 class="mb-3">Point of Sale</h4><div class="row g-3">
  <div class="col-lg-7"><div class="card"><div class="card-body">
    <label class="form-label fw-semibold">Buffet package</label>
    <select id="prod" class="form-select mb-3">${products.map((p) => `<option value="${p.id}">${esc(p.name)} — adult ${peso(tier(p, 'adult'))}</option>`).join('')}</select>
    <div class="row g-2" id="guests"></div>
    <hr>
    <div class="row g-2">
      <div class="col-md-6"><label class="form-label">Customer name</label><input id="cname" class="form-control" placeholder="Walk-in"></div>
      <div class="col-md-6"><label class="form-label">Table (optional)</label><select id="tbl" class="form-select"><option value="">— none —</option>
        ${tables.map((t) => `<option value="${t.id}" ${String(t.id) === pre ? 'selected' : ''}>${esc(t.name)} (${esc(t.status)}${t.session_id ? ', open tab' : ''})</option>`).join('')}</select></div>
      <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="walkin" checked><label class="form-check-label" for="walkin">Walk-in (issue queue number)</label></div></div>
    </div></div></div></div>
  <div class="col-lg-5"><div class="card"><div class="card-body">
    <h6>Summary</h6>
    <div class="d-flex justify-content-between"><span>Subtotal</span><span id="sub">₱0.00</span></div>
    <div class="d-flex justify-content-between align-items-center"><span>Promo discount %</span><input id="promo" type="number" min="0" max="100" step="0.01" value="0" class="form-control form-control-sm w-25 text-end"></div>
    <div class="d-flex justify-content-between text-danger"><span>Discount</span><span id="disc">-₱0.00</span></div>
    <div class="d-flex justify-content-between fw-bold fs-5 border-top pt-2 mt-2"><span>Total</span><span id="total">₱0.00</span></div>
    <div class="small text-muted" id="sav"></div>
    <div class="small text-warning" id="apprnote"></div>
    <hr><h6>Payments <button class="btn btn-sm btn-outline-success float-end" id="addpay" type="button">+ split</button></h6>
    <div id="pays"></div>
    <div class="d-flex justify-content-between mt-2"><span>Tendered</span><span id="tend">₱0.00</span></div>
    <div class="d-flex justify-content-between"><span>Change</span><span id="chg">₱0.00</span></div>
    <div id="proofwrap" class="mt-2 d-none"><label class="form-label">Proof of payment (required for GCash)</label><input type="file" id="proof" accept="image/*,.pdf" class="form-control form-control-sm"></div>
    <button id="go" class="btn btn-sv w-100 mt-3 btn-lg">Complete sale</button>
  </div></div></div></div>`;

  const guests = [['adult', 'Adult'], ['senior', 'Senior'], ['pwd', 'PWD'], ['kids', 'Kids'], ['free', 'Free (≤3ft / celebrant)']];
  const gEl = el.querySelector('#guests');
  gEl.innerHTML = guests.map(([k, l]) => `<div class="col-6 col-md-4"><label class="form-label small mb-0">${l} <span class="text-muted" data-price="${k}"></span></label>
    <input type="number" min="0" value="0" class="form-control" data-g="${k}"></div>`).join('');
  const pays = el.querySelector('#pays');
  const addPay = (m = 'Cash') => {
    const r = document.createElement('div'); r.className = 'row g-1 mb-1 pay';
    r.innerHTML = `<div class="col-4"><select class="form-select form-select-sm" data-f="method">${['Cash', 'GCash', 'Credit Card'].map((x) => `<option ${x === m ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="col-4"><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-f="amount" placeholder="Amount"></div>
      <div class="col-3"><input class="form-control form-control-sm" data-f="reference_number" placeholder="Ref #"></div>
      <div class="col-1"><button type="button" class="btn btn-sm text-danger p-0" data-rm>✕</button></div>`;
    pays.appendChild(r);
  };
  addPay();

  const cur = () => products.find((p) => String(p.id) === el.querySelector('#prod').value);
  const read = () => {
    const g = {}; el.querySelectorAll('[data-g]').forEach((i) => (g[i.dataset.g] = Math.max(0, parseInt(i.value || '0', 10) || 0)));
    return g;
  };
  const payments = () => [...pays.querySelectorAll('.pay')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.value])));
  const calc = () => {
    const p = cur(), g = read();
    el.querySelectorAll('[data-price]').forEach((s) => (s.textContent = `(${peso(tier(p, s.dataset.price))})`));
    const sub = g.adult * tier(p, 'adult') + g.senior * tier(p, 'senior') + g.pwd * tier(p, 'pwd') + g.kids * tier(p, 'kids');
    const sav = (tier(p, 'adult') - tier(p, 'senior')) * g.senior + (tier(p, 'adult') - tier(p, 'pwd')) * g.pwd;
    const pct = Math.min(100, Math.max(0, num(el.querySelector('#promo').value)));
    const disc = Math.round(sub * pct) / 100, total = Math.max(0, sub - disc);
    const tend = payments().reduce((a, x) => a + num(x.amount), 0);
    el.querySelector('#sub').textContent = peso(sub); el.querySelector('#disc').textContent = '-' + peso(disc);
    el.querySelector('#total').textContent = peso(total); el.querySelector('#tend').textContent = peso(tend);
    el.querySelector('#chg').textContent = peso(Math.max(0, tend - total));
    el.querySelector('#sav').textContent = sav ? `Senior/PWD savings vs adult price: ${peso(sav)}` : '';
    const limit = num(state.settings.max_staff_discount_percent || 10);
    el.querySelector('#apprnote').textContent = !isAdmin() && (disc > 1000 || pct > limit) ? 'This discount needs admin approval before the sale posts.' : '';
    const hasG = payments().some((x) => x.method === 'GCash');
    el.querySelector('#proofwrap').classList.toggle('d-none', !hasG);
    return { total };
  };
  el.addEventListener('input', calc); el.addEventListener('change', calc);
  el.querySelector('#addpay').onclick = () => addPay('GCash');
  on(el, 'click', '[data-rm]', (e, t) => { if (pays.children.length > 1) { t.closest('.pay').remove(); calc(); } });
  calc();

  el.querySelector('#go').onclick = guard(async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    let proofPath = null;
    try {
      const pl = payments().filter((x) => x.amount !== '' || x.method !== 'Cash');
      const file = el.querySelector('#proof').files[0];
      if (pl.some((x) => x.method === 'GCash') && file) proofPath = await uploadProof(file, 'sales');
      const g = read();
      const res = await rpc('checkout', { p: {
        product_id: cur().id, ...g, promo_discount_percent: num(el.querySelector('#promo').value),
        payments: pl.filter((x) => x.amount !== ''), is_walkin: el.querySelector('#walkin').checked,
        table_id: el.querySelector('#tbl').value || null, customer_name: el.querySelector('#cname').value.trim(), has_proof: !!proofPath } });
      if (proofPath) await sb.from('sale_attachments').insert({ sale_id: res.sale_id, file_path: proofPath });
      if (res.requires_approval) toast(`Sale ${res.sale_number} is waiting for admin approval.`, 'warning');
      else toast(`Sale ${res.sale_number} completed — ${peso(res.total)}`);
      if (!res.requires_approval && confirm('Print receipt?')) await printReceipt(res.sale_id);
      location.hash = '#/sale/' + res.sale_id;
    } catch (err) {
      if (proofPath) await sb.storage.from('proofs').remove([proofPath]);   // don't leave orphaned uploads
      throw err;
    } finally { btn.disabled = false; }
  });
}
