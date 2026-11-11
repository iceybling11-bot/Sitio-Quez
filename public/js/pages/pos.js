import { sb, state, esc, peso, num, run, rpc, on, guard, toast, uploadProof, isAdmin } from '../core.js';
import { printReceipt } from './sales.js';

export default async function (el) {
  const products = await run(sb.from('products').select('*, buffet_tiers(*)').eq('is_buffet', true).eq('available', true).order('id'));
  if (!products.length) { el.innerHTML = '<div class="alert alert-warning">No buffet package is set up yet. An admin can add one under Menu / Products.</div>'; return; }
  const tier = (p, t) => num(p.buffet_tiers.find((x) => x.tier === t)?.price);

  el.innerHTML = `<h4 class="mb-3">Point of Sale</h4><div class="row g-3">
  <div class="col-lg-7"><div class="card"><div class="card-body">
    <label class="form-label fw-semibold">Buffet package</label>
    <select id="prod" class="form-select mb-3">${products.map((p) => `<option value="${p.id}">${esc(p.name)} — adult ${peso(tier(p, 'adult'))}</option>`).join('')}</select>
    <div class="row g-2" id="guests"></div>
    <hr>
    <div class="row g-2">
      <div class="col-12"><label class="form-label">Customer name</label><input id="cname" class="form-control" placeholder="Walk-in"></div>
      <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="walkin" checked><label class="form-check-label" for="walkin">Walk-in (issue queue number)</label></div></div>
    </div></div></div></div>
  <div class="col-lg-5"><div class="card"><div class="card-body">
    <h6>Price breakdown</h6>
    <div class="table-responsive"><table class="table table-sm mb-2 align-middle"><thead><tr><th>Category</th><th class="text-end">Price</th><th class="text-end">Qty</th><th class="text-end">Subtotal</th></tr></thead><tbody id="bk"></tbody></table></div>
    <div class="d-flex justify-content-between"><span>Subtotal</span><span id="sub">₱0.00</span></div>
    <div class="d-flex justify-content-between align-items-center"><span>Promo discount %</span><input id="promo" type="number" min="0" max="100" step="0.01" value="0" class="form-control form-control-sm w-25 text-end"></div>
    <div class="d-flex justify-content-between text-danger"><span>Discount</span><span id="disc">-₱0.00</span></div>
    <div class="d-flex justify-content-between fw-bold fs-5 border-top pt-2 mt-2"><span>Total Bill</span><span id="total">₱0.00</span></div>
    <div class="small text-muted" id="sav"></div>
    <div class="small text-warning" id="apprnote"></div>
    <hr><h6>Payments <button class="btn btn-sm btn-outline-success float-end" id="addpay" type="button">+ split</button></h6>
    <div id="pays"></div>
    <div class="d-flex justify-content-between mt-2"><span>Total Amount Paid</span><span id="tend">₱0.00</span></div>
    <div class="d-flex justify-content-between fw-semibold"><span>Remaining Balance</span><span id="rem">₱0.00</span></div>
    <div class="d-flex justify-content-between"><span>Change</span><span id="chg">₱0.00</span></div>
    <div id="qrwrap" class="mt-3 d-none"><div class="small fw-semibold text-center mb-1">Scan to pay (customer)</div><div id="qrs" class="d-flex gap-2 justify-content-center flex-wrap"></div></div>
    <div id="proofwrap" class="mt-2 d-none"><label class="form-label">Proof of payment (required for GCash / Bank Transfer)</label><input type="file" id="proof" accept="image/*,.pdf" class="form-control form-control-sm"></div>
    <div class="small text-danger mt-2" id="paynote"></div>
    <button id="go" class="btn btn-sv w-100 mt-2 btn-lg">Complete sale</button>
  </div></div></div></div>`;

  const guests = [['adult', 'Adult'], ['senior', 'Senior'], ['pwd', 'PWD'], ['kids', 'Kids'], ['free', 'Free (≤3ft / celebrant)']];
  const gEl = el.querySelector('#guests');
  gEl.innerHTML = guests.map(([k, l]) => `<div class="col-6 col-md-4"><label class="form-label small mb-0">${l} <span class="text-muted" data-price="${k}"></span></label>
    <input type="number" min="0" value="0" class="form-control" data-g="${k}"></div>`).join('');
  const pays = el.querySelector('#pays');
  // auto = this row's amount follows the remaining balance until the cashier types in it
  const addPay = (m = 'Cash', auto = false) => {
    const r = document.createElement('div'); r.className = 'row g-1 mb-1 pay'; r.dataset.auto = auto ? '1' : '0';
    r.innerHTML = `<div class="col-4"><select class="form-select form-select-sm" data-f="method">${['Cash', 'GCash', 'Bank Transfer', 'Credit Card'].map((x) => `<option ${x === m ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="col-4"><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-f="amount" placeholder="Amount"></div>
      <div class="col-3"><input class="form-control form-control-sm" data-f="reference_number" placeholder="Ref #"></div>
      <div class="col-1"><button type="button" class="btn btn-sm text-danger p-0" data-rm>✕</button></div>`;
    pays.appendChild(r);
  };
  addPay();

  const cents = (n) => Math.round((num(n) + Number.EPSILON) * 100);   // work in whole centavos so sums never drift
  const cur = () => products.find((p) => String(p.id) === el.querySelector('#prod').value);
  const read = () => {
    const g = {}; el.querySelectorAll('[data-g]').forEach((i) => (g[i.dataset.g] = Math.max(0, parseInt(i.value || '0', 10) || 0)));
    return g;
  };
  const payments = () => [...pays.querySelectorAll('.pay')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.value])));
  const calc = () => {
    const p = cur(), g = read();
    el.querySelectorAll('[data-price]').forEach((s) => (s.textContent = `(${peso(tier(p, s.dataset.price))})`));
    // same arithmetic as the checkout() SQL function: tier price x head count, then promo % off the subtotal
    const lines = guests.map(([k, l]) => {   // Free guests are never charged, whatever is stored for that tier
      const price = k === 'free' ? 0 : cents(tier(p, k));
      return { label: l.split(' (')[0], price, qty: g[k], sub: price * g[k] };
    });
    const subC = lines.reduce((a, x) => a + x.sub, 0);
    const savC = (cents(tier(p, 'adult')) - cents(tier(p, 'senior'))) * g.senior + (cents(tier(p, 'adult')) - cents(tier(p, 'pwd'))) * g.pwd;
    const pct = Math.min(100, Math.max(0, num(el.querySelector('#promo').value)));
    const discC = Math.round(subC * pct / 100), totalC = Math.max(0, subC - discC);

    // auto rows take whatever is still unpaid after the rows the cashier typed
    const rows = [...pays.querySelectorAll('.pay')];
    let paidC = rows.filter((r) => r.dataset.auto !== '1').reduce((a, r) => a + cents(r.querySelector('[data-f=amount]').value), 0);
    rows.filter((r) => r.dataset.auto === '1').forEach((r) => {
      const v = Math.max(0, totalC - paidC); r.querySelector('[data-f=amount]').value = v ? (v / 100).toFixed(2) : ''; paidC += v;
    });
    const remC = Math.max(0, totalC - paidC), chgC = Math.max(0, paidC - totalC);

    el.querySelector('#bk').innerHTML = lines.map((x) => `<tr><td>${x.label}</td><td class="text-end">${peso(x.price / 100)}</td><td class="text-end">${x.qty}</td><td class="text-end">${peso(x.sub / 100)}</td></tr>`).join('');
    el.querySelector('#sub').textContent = peso(subC / 100); el.querySelector('#disc').textContent = '-' + peso(discC / 100);
    el.querySelector('#total').textContent = peso(totalC / 100); el.querySelector('#tend').textContent = peso(paidC / 100);
    el.querySelector('#rem').textContent = peso(remC / 100); el.querySelector('#rem').classList.toggle('text-danger', remC > 0);
    el.querySelector('#chg').textContent = peso(chgC / 100);
    el.querySelector('#sav').textContent = savC ? `Senior/PWD savings vs adult price: ${peso(savC / 100)}` : '';
    const disc = discC / 100;
    const limit = num(state.settings.max_staff_discount_percent || 10);
    el.querySelector('#apprnote').textContent = !isAdmin() && (disc > 1000 || pct > limit) ? 'This discount needs admin approval before the sale posts.' : '';
    const ms = payments().map((x) => x.method);
    const needsProof = ms.includes('GCash') || ms.includes('Bank Transfer');
    el.querySelector('#proofwrap').classList.toggle('d-none', !needsProof);
    const qrs = [ms.includes('GCash') && ['img/qr-gcash.jpg', 'GCash'], ms.includes('Bank Transfer') && ['img/qr-psbank.jpg', 'PSBank / InstaPay']].filter(Boolean);
    el.querySelector('#qrwrap').classList.toggle('d-none', !qrs.length);
    const html = qrs.map(([src, label]) => `<figure class="m-0 text-center"><img src="${src}" alt="${label} QR" style="max-height:340px;max-width:100%" class="border rounded"><figcaption class="small text-muted">${label}</figcaption></figure>`).join('');
    const box = el.querySelector('#qrs'); if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }

    // checkout is blocked until the bill is covered (the checkout() SQL function enforces the same rule)
    const pax = Object.values(g).reduce((a, b) => a + b, 0);
    const note = !pax ? 'Enter the number of guests.' : paidC <= 0 ? 'Enter a payment amount.' : remC > 0 ? `Payment is short by ${peso(remC / 100)}.` : '';
    el.querySelector('#paynote').textContent = note;
    el.querySelector('#go').disabled = !!note;
    return { total: totalC / 100 };
  };
  // typing in an amount takes that row off auto-fill; everything else just recalculates
  el.addEventListener('input', (e) => { if (e.target.matches?.('[data-f=amount]')) e.target.closest('.pay').dataset.auto = '0'; calc(); });
  el.addEventListener('change', calc);
  el.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-f=amount]')) e.target.select?.(); });
  el.querySelector('#addpay').onclick = () => { addPay('GCash', true); calc(); };
  on(el, 'click', '[data-rm]', (e, t) => { if (pays.children.length > 1) { t.closest('.pay').remove(); calc(); } });
  calc();

  el.querySelector('#go').onclick = guard(async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;   // blocks a double-tap from posting the same sale twice
    let proofPath = null;
    try {
      const pl = payments().filter((x) => num(x.amount) > 0);
      if (!pl.length) throw new Error('Enter a payment amount.');
      const remote = pl.filter((x) => x.method === 'GCash' || x.method === 'Bank Transfer');
      if (remote.some((x) => !String(x.reference_number || '').trim())) throw new Error('Enter the reference number for each GCash / Bank Transfer payment.');
      const file = el.querySelector('#proof').files[0];
      if (remote.length && !file) throw new Error('Attach proof of payment for GCash / Bank Transfer.');
      if (remote.length && file) proofPath = await uploadProof(file, 'sales');
      const g = read();
      const res = await rpc('checkout', { p: {
        product_id: cur().id, ...g, promo_discount_percent: num(el.querySelector('#promo').value),
        payments: pl, is_walkin: el.querySelector('#walkin').checked,
        customer_name: el.querySelector('#cname').value.trim(), has_proof: !!proofPath } });
      if (proofPath) await sb.from('sale_attachments').insert({ sale_id: res.sale_id, file_path: proofPath });
      if (res.requires_approval) toast(`Sale ${res.sale_number} is waiting for admin approval.`, 'warning');
      else toast(`Sale ${res.sale_number} completed — ${peso(res.total)}`);
      if (!res.requires_approval && confirm('Print receipt?')) await printReceipt(res.sale_id);
      location.hash = '#/sale/' + res.sale_id;
    } catch (err) {
      if (proofPath) await sb.storage.from('proofs').remove([proofPath]);   // don't leave orphaned uploads
      throw err;
    } finally { calc(); }   // re-evaluates the button from the current amounts
  });
}
