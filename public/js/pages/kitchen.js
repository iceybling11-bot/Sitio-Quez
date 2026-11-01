import { sb, esc, run, on, toast } from '../core.js';

const next = { preparing: 'ready', ready: 'served', served: 'completed' };
let timer;

export default async function (el) {
  clearInterval(timer);
  const load = async () => {
    const items = await run(sb.from('sale_items').select('id,product_name,quantity,kitchen_status,sales!inner(sale_number,status,created_at,table:restaurant_tables!table_id(name))')
      .neq('kitchen_status', 'completed').in('sales.status', ['completed', 'open']).order('id'));
    el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Kitchen queue</h4><small class="text-muted">auto-refreshes every 15s</small></div><div class="row g-3">
      ${items.map((i) => `<div class="col-md-4 col-xl-3"><div class="card kitchen-card status-${i.kitchen_status}"><div class="card-body">
        <div class="fw-bold">${esc(i.product_name)} <span class="badge badge-sv">x${i.quantity}</span></div>
        <div class="small text-muted">${esc(i.sales.sale_number)}${i.sales.table ? ' · ' + esc(i.sales.table.name) : ''}</div>
        <div class="my-2 text-capitalize">${esc(i.kitchen_status)}</div>
        <button class="btn btn-sm btn-sv" data-adv="${i.id}|${next[i.kitchen_status]}">Mark ${next[i.kitchen_status]}</button></div></div></div>`).join('') || '<p class="text-muted">No active orders.</p>'}</div>`;
  };
  await load();
  on(el, 'click', '[data-adv]', async (e, t) => {
    const [id, status] = t.dataset.adv.split('|');
    await run(sb.from('sale_items').update({ kitchen_status: status }).eq('id', id)); await load();
  });
  timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); load().catch(() => {}); }, 15000);
}
