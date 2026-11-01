import { sb, state, esc, toast, guard, run, rpc, isAdmin, loadSettings } from './core.js';

const app = document.getElementById('app');

// route table: pattern -> [module, export, adminOnly]
const routes = [
  ['dashboard', 'dashboard', 'default'],
  ['pos', 'pos', 'default'],
  ['history', 'sales', 'history'],
  ['sale/:id', 'sales', 'detail'],
  ['approvals', 'sales', 'approvals', true],
  ['tables', 'tables', 'layout'],
  ['session/:id', 'tables', 'session'],
  ['kitchen', 'kitchen', 'default'],
  ['reservations', 'reservations', 'list'],
  ['reservations/new', 'reservations', 'create'],
  ['reservations/calendar', 'reservations', 'calendar'],
  ['reservation/:id', 'reservations', 'detail'],
  ['reservation/:id/billing', 'reservations', 'billing'],
  ['customers', 'customers', 'list'],
  ['customer/:id', 'customers', 'detail'],
  ['inventory', 'inventory', 'list', true],
  ['inventory/suppliers', 'inventory', 'suppliers', true],
  ['inventory/low', 'inventory', 'low', true],
  ['inventory/:id/history', 'inventory', 'history', true],
  ['expenses', 'finance', 'expenses', true],
  ['reports', 'finance', 'reports', true],
  ['shift', 'shifts', 'mine'],
  ['shifts', 'shifts', 'all', true],
  ['shift/:id', 'shifts', 'detail'],
  ['products', 'admin', 'products', true],
  ['users', 'admin', 'users', true],
  ['settings', 'admin', 'settings', true],
  ['logs', 'admin', 'logs', true],
  ['backup', 'admin', 'backup', true],
  ['notifications', 'notifications', 'default'],
];

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pat, mod, fn, adminOnly] of routes) {
    const pp = pat.split('/');
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((seg, i) => (seg[0] === ':' ? ((params[seg.slice(1)] = decodeURIComponent(parts[i])), true) : seg === parts[i]))) {
      return { mod, fn, adminOnly, params };
    }
  }
  return null;
}

const nav = [
  ['dashboard', 'speedometer2', 'Dashboard'], ['pos', 'cash-register', 'POS'], ['tables', 'grid-3x3-gap', 'Tables'],
  ['kitchen', 'egg-fried', 'Kitchen'], ['reservations', 'calendar-check', 'Reservations'], ['customers', 'people', 'Customers'],
  ['inventory', 'box-seam', 'Inventory', 1], ['products', 'egg-fried', 'Menu / Products', 1], ['reports', 'bar-chart', 'Reports', 1],
  ['expenses', 'wallet2', 'Expenses', 1], ['users', 'person-badge', 'Staff', 1], ['settings', 'gear', 'Settings', 1],
  ['backup', 'cloud-arrow-down', 'Backup', 1], ['approvals', 'shield-check', 'Approvals', 1], ['shifts', 'cash-stack', 'All Shifts', 1],
  ['history', 'receipt', 'Sales History'], ['shift', 'cash-stack', 'My Shift'],
].filter((n) => !n[3] || isAdmin());

async function unreadCount() {
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
  return count || 0;
}

async function renderShell() {
  const unread = await unreadCount();
  const links = (cls) => nav.map(([r, i, l]) => `<a class="${cls}" href="#/${r}" data-r="${r}"><i class="bi bi-${i}"></i> ${l}</a>`).join('');
  app.innerHTML = `
  <nav class="navbar navbar-expand-lg navbar-sv shadow-sm"><div class="container-fluid">
    <a class="navbar-brand fw-bold" href="#/dashboard"><i class="bi bi-flower1"></i> ${esc(state.settings.restaurant_name || 'Sitio Verde')}</a>
    <button class="navbar-toggler bg-light" data-bs-toggle="collapse" data-bs-target="#nav1"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="nav1">
      <div class="d-lg-none">${links('nav-link')}<hr class="text-white-50"></div>
      <ul class="navbar-nav ms-auto align-items-lg-center">
        <li class="nav-item"><a class="nav-link" href="#/notifications"><i class="bi bi-bell"></i> ${unread ? `<span class="badge bg-danger">${unread}</span>` : ''}</a></li>
        <li class="nav-item"><span class="nav-link">${esc(state.profile.name || state.profile.username)} <small class="badge badge-sv">${esc(state.profile.role)}</small></span></li>
        <li class="nav-item"><a class="nav-link" href="#" id="logout"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
      </ul></div></div></nav>
  <div class="container-fluid"><div class="row">
    <div class="col-lg-2 sidebar py-3 d-none d-lg-block">${links('')}</div>
    <div class="col-lg-10 py-3" id="view"></div></div></div>`;
  document.getElementById('logout').onclick = guard(async (e) => { e.preventDefault(); await sb.auth.signOut(); });
}

let navToken = 0;
async function route() {
  if (!state.profile) return;
  const token = ++navToken;
  const [pathPart] = (location.hash.slice(1) || '/dashboard').split('?');
  const m = match(pathPart);
  if (!document.getElementById('view')) await renderShell();
  // Fresh container per navigation so the previous page's event listeners are dropped
  const old = document.getElementById('view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  document.querySelectorAll('[data-r]').forEach((a) => a.classList.toggle('active', pathPart.startsWith('/' + a.dataset.r)));
  if (!m) { view.innerHTML = '<h3>Page not found</h3><a href="#/dashboard">Back to dashboard</a>'; return; }
  if (m.adminOnly && !isAdmin()) { view.innerHTML = '<h3>Access denied</h3><p class="text-muted">This page is for administrators.</p>'; return; }
  view.innerHTML = '<div class="text-center p-5 text-muted"><div class="spinner-border spinner-border-sm"></div> Loading…</div>';
  try {
    const mod = await import(`./pages/${m.mod}.js`);
    if (token !== navToken) return;
    view.innerHTML = '';
    await mod[m.fn](view, m.params);
  } catch (e) {
    console.error(e);
    if (token === navToken) view.innerHTML = `<div class="alert alert-danger">Something went wrong: ${esc(e.message)}</div>`;
  }
}

function renderLogin(msg) {
  app.innerHTML = `<div class="container" style="max-width:420px"><div class="card shadow-sm mt-5"><div class="card-body p-4">
    <h4 class="text-center mb-1"><i class="bi bi-flower1 text-success"></i> Sitio Verde</h4>
    <p class="text-center text-muted">Buffet Restaurant POS</p>
    ${msg ? `<div class="alert alert-warning">${esc(msg)}</div>` : ''}
    <form id="lf"><div class="mb-3"><label class="form-label">Email</label><input name="email" type="email" class="form-control" required autofocus></div>
    <div class="mb-3"><label class="form-label">Password</label><input name="password" type="password" class="form-control" required></div>
    <button class="btn btn-sv w-100">Sign in</button></form></div></div></div>`;
  document.getElementById('lf').onsubmit = guard(async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    if (error) throw new Error('Invalid email or password.');
  });
}

function renderChangePassword() {
  app.innerHTML = `<div class="container" style="max-width:440px"><div class="card shadow-sm mt-5"><div class="card-body p-4">
    <h5>Set a new password</h5><p class="text-muted">You must choose a new password before continuing.</p>
    <form id="pf"><div class="mb-3"><label class="form-label">New password (min 8 characters)</label><input name="p1" type="password" minlength="8" class="form-control" required></div>
    <div class="mb-3"><label class="form-label">Confirm password</label><input name="p2" type="password" minlength="8" class="form-control" required></div>
    <button class="btn btn-sv w-100">Save password</button> <a href="#" id="lo" class="d-block text-center mt-2">Log out</a></form></div></div></div>`;
  document.getElementById('lo').onclick = guard(async (e) => { e.preventDefault(); await sb.auth.signOut(); });
  document.getElementById('pf').onsubmit = guard(async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.p1 !== f.p2) throw new Error('Passwords do not match.');
    const { error } = await sb.auth.updateUser({ password: f.p1 });
    if (error) throw new Error(error.message);
    await rpc('change_password_done');
    state.profile.must_change_password = false;
    toast('Password updated.');
    start();
  });
}

export async function changeOwnPassword() { renderChangePassword(); }

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { state.profile = null; return renderLogin(); }
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error || !profile) { await sb.auth.signOut(); return renderLogin('Your account has no staff profile. Ask an administrator.'); }
  if (!profile.active) { await sb.auth.signOut(); return renderLogin('This account has been deactivated.'); }
  state.profile = profile;
  if (profile.must_change_password) return renderChangePassword();
  await loadSettings().catch(() => {});
  document.title = `${state.settings.restaurant_name || 'Sitio Verde'} POS`;
  await renderShell();
  if (!location.hash) location.hash = '#/dashboard';
  route();
}

window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((event) => {
  // supabase-js re-fires SIGNED_IN when a tab regains focus; ignore that if we're already logged in
  if (event === 'SIGNED_IN' && state.profile) return;
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { if (event === 'SIGNED_OUT') state.profile = null; app.innerHTML = ''; setTimeout(start, 0); }
});
start();
