import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const state = { profile: null, settings: {} };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const peso = (n) => '₱' + num(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dt = (s) => (s ? new Date(s).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const dOnly = (s) => (s ? new Date(s + (String(s).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
export const tm = (s) => { if (!s) return ''; const [h, m] = s.split(':'); const H = +h; return `${((H + 11) % 12) + 1}:${m} ${H >= 12 ? 'PM' : 'AM'}`; };
export const today = () => { const n = new Date(); return new Date(n - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const isAdmin = () => state.profile?.role === 'admin';

export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Strip Postgres noise so users see the message the function raised
const cleanErr = (e) => String(e?.message || e).replace(/^.*?ERROR:\s*/, '');

export async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(cleanErr(error));
  return data;
}
export async function run(q) {
  const { data, error } = await q;
  if (error) throw new Error(cleanErr(error));
  return data;
}
// Wrap an async handler so failures show as a toast instead of an unhandled rejection
export const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); toast(cleanErr(e), 'danger'); } };

export function on(root, event, selector, handler) {
  // One live listener per (event, selector) on a root, so re-rendering a page can't stack duplicate handlers
  root.__h = root.__h || {};
  const key = event + '|' + selector;
  if (root.__h[key]) root.removeEventListener(event, root.__h[key]);
  const fn = guard((e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) return handler(e, t);
  });
  root.__h[key] = fn;
  root.addEventListener(event, fn);
}

export function modal({ title, body, okText = 'Save', okClass = 'btn-sv', onOk, size = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal fade';
  wrap.innerHTML = `<div class="modal-dialog ${size}"><div class="modal-content"><form>
    <div class="modal-header"><h5 class="modal-title">${esc(title)}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
    <button type="submit" class="btn ${okClass}">${esc(okText)}</button></div></form></div></div>`;
  document.body.appendChild(wrap);
  const m = new bootstrap.Modal(wrap);
  wrap.addEventListener('hidden.bs.modal', () => { m.dispose(); wrap.remove(); });
  wrap.querySelector('form').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    try { await onOk(Object.fromEntries(new FormData(e.target)), wrap); m.hide(); }
    catch (err) { toast(cleanErr(err), 'danger'); }
    finally { btn.disabled = false; }
  }));
  m.show();
  return wrap;
}
export const confirmBox = (msg, onOk, okText = 'Confirm') =>
  modal({ title: 'Please confirm', body: `<p class="mb-0">${esc(msg)}</p>`, okText, okClass: 'btn-danger', onOk });

export function badge(status) {
  const map = { completed: 'success', Completed: 'success', open: 'warning', voided: 'secondary', Verified: 'success', Pending: 'warning',
    Rejected: 'danger', Reserved: 'warning', Confirmed: 'success', 'Checked In': 'primary', Cancelled: 'secondary', 'No Show': 'danger',
    preparing: 'warning', ready: 'info', served: 'secondary', available: 'success', occupied: 'danger', reserved: 'warning', cleaning: 'secondary' };
  return `<span class="badge bg-${map[status] || 'secondary'}">${esc(status)}</span>`;
}

export async function loadSettings() {
  const rows = await run(sb.from('settings').select('*'));
  state.settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// Private proof-of-payment files live in the 'proofs' bucket; view through short-lived signed URLs
export async function uploadProof(file, folder) {
  if (!file || !file.size) return null;
  const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
  if (!ok.includes(file.type)) throw new Error('File type not allowed (use PNG, JPG, WEBP, GIF or PDF).');
  if (file.size > 10 * 1024 * 1024) throw new Error('File is too large (max 10 MB).');
  const path = `${folder}/${crypto.randomUUID()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
  const { error } = await sb.storage.from('proofs').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
}
export async function signedUrl(path) {
  const { data, error } = await sb.storage.from('proofs').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export function pager(total, page, per, base) {
  const pages = Math.ceil(total / per);
  if (pages <= 1) return '';
  const link = (p, label, dis) => `<li class="page-item ${dis ? 'disabled' : ''}"><a class="page-link" href="${base}${p}">${label}</a></li>`;
  return `<nav><ul class="pagination pagination-sm">${link(page - 1, '«', page <= 1)}<li class="page-item disabled"><span class="page-link">Page ${page} of ${pages}</span></li>${link(page + 1, '»', page >= pages)}</ul></nav>`;
}

export function downloadCSV(name, rows) {
  const cell = (v) => { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export const PAGE_SIZE = 25;
export const hashParams = () => new URLSearchParams((location.hash.split('?')[1]) || '');
