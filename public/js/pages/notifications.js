import { sb, esc, dt, run, on, badge } from '../core.js';

export default async function (el) {
  const data = await run(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100));
  const link = (n) => (['discount_approval'].includes(n.type) ? '#/sale/' + n.related_id : n.type === 'low_inventory' ? '#/inventory/low' : n.type.includes('reservation') ? '#/reservation/' + n.related_id : '#');
  el.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4>Notifications</h4><button class="btn btn-outline-success" id="all">Mark all read</button></div>
  <div class="list-group">${data.map((n) => `<a class="list-group-item list-group-item-action ${n.is_read ? '' : 'fw-bold'}" href="${link(n)}" data-read="${n.id}">${esc(n.message)}<br><small class="text-muted fw-normal">${dt(n.created_at)}</small></a>`).join('') || '<div class="list-group-item text-muted">Nothing here.</div>'}</div>`;
  on(el, 'click', '[data-read]', async (e, t) => { await sb.from('notifications').update({ is_read: true }).eq('id', t.dataset.read); });
  on(el, 'click', '#all', async () => { await run(sb.from('notifications').update({ is_read: true }).eq('is_read', false)); location.reload(); });
}
