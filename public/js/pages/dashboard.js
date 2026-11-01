import { rpc, run, sb, esc, peso, dt, num, badge } from '../core.js';

export default async function (el) {
  const [s, recent, upcoming] = await Promise.all([
    rpc('dashboard_stats'),
    run(sb.from('sales').select('id,sale_number,customer_name,total,status,created_at').order('created_at', { ascending: false }).limit(8)),
    run(sb.from('reservations').select('id,customer_name,pax,date,time,status,event_type').in('status', ['Reserved', 'Confirmed'])
      .gte('date', new Date().toISOString().slice(0, 10)).order('date').order('time').limit(6)),
  ]);
  const stat = (label, val, icon) => `<div class="col-md-4 col-xl-2"><div class="card card-stat"><div class="card-body py-3">
    <div class="text-muted small"><i class="bi bi-${icon}"></i> ${label}</div><div class="fs-5 fw-bold">${val}</div></div></div></div>`;
  el.innerHTML = `<h4 class="mb-3">Dashboard</h4>
  <div class="row g-3 mb-4">
    ${stat("Today's Sales", peso(s.today_sales), 'cash-coin')}${stat('This Month', peso(s.monthly), 'calendar3')}
    ${stat("Today's Reservations", s.today_reservations, 'calendar-check')}${stat('Occupied Tables', s.occupied_tables, 'grid-3x3-gap')}
    ${stat('Upcoming', s.upcoming, 'clock-history')}${stat('Low Stock Items', s.low_stock, 'exclamation-triangle')}
  </div>
  <p class="text-muted">Best seller this month: <strong>${esc(s.best_seller)}</strong></p>
  <div class="row g-3 mb-4">
    <div class="col-lg-8"><div class="card"><div class="card-header">Sales — last 7 days</div><div class="card-body"><canvas id="c1" height="110"></canvas></div></div></div>
    <div class="col-lg-4"><div class="card"><div class="card-header">Reservations by status</div><div class="card-body"><canvas id="c2"></canvas></div></div></div>
  </div>
  <div class="row g-3">
    <div class="col-lg-7"><div class="card"><div class="card-header">Recent sales</div><div class="table-responsive"><table class="table table-sm mb-0">
      <thead><tr><th>#</th><th>Customer</th><th>Total</th><th>Status</th><th>When</th></tr></thead><tbody>
      ${recent.map((r) => `<tr><td><a href="#/sale/${r.id}">${esc(r.sale_number)}</a></td><td>${esc(r.customer_name)}</td><td>${peso(r.total)}</td><td>${badge(r.status)}</td><td>${dt(r.created_at)}</td></tr>`).join('') || '<tr><td colspan=5 class="text-muted">No sales yet.</td></tr>'}
      </tbody></table></div></div></div>
    <div class="col-lg-5"><div class="card"><div class="card-header">Upcoming reservations</div><ul class="list-group list-group-flush">
      ${upcoming.map((r) => `<li class="list-group-item"><a href="#/reservation/${r.id}">${esc(r.customer_name)}</a> · ${r.pax} pax<br><small class="text-muted">${r.date} ${esc(r.time.slice(0, 5))} ${esc(r.event_type || '')}</small></li>`).join('') || '<li class="list-group-item text-muted">None scheduled.</li>'}
    </ul></div></div></div>`;
  new Chart(el.querySelector('#c1'), { type: 'bar', data: { labels: s.sales_chart.map((x) => x.label), datasets: [{ label: 'PHP', data: s.sales_chart.map((x) => num(x.total)), backgroundColor: '#2f7a4f' }] }, options: { plugins: { legend: { display: false } } } });
  new Chart(el.querySelector('#c2'), { type: 'doughnut', data: { labels: s.reservation_chart.map((x) => x.label), datasets: [{ data: s.reservation_chart.map((x) => x.count), backgroundColor: ['#f0ad4e', '#2f7a4f', '#0d6efd', '#198754', '#6c757d', '#dc3545'] }] } });
}
