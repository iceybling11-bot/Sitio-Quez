// Creates / resets staff accounts. Needs the service-role key, so it can only live server-side.
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables (never commit them).
const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !SERVICE) return json(500, { error: 'Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.' });

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in.' });
  const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  // 1. Who is calling? Verify the JWT with Supabase, then require an active admin profile.
  const who = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json(401, { error: 'Invalid session.' });
  const caller = await who.json();
  const prof = await (await fetch(`${URL}/rest/v1/profiles?id=eq.${caller.id}&select=role,active`, { headers: svc })).json();
  if (!prof[0] || prof[0].role !== 'admin' || !prof[0].active) return json(403, { error: 'Admins only.' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request.' }); }
  const pw = String(b.password || '');
  if (pw.length < 8) return json(400, { error: 'Password must be at least 8 characters.' });

  if (b.action === 'create') {
    const username = String(b.username || '').trim(), email = String(b.email || '').trim().toLowerCase();
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username) || !email) return json(400, { error: 'Valid username and email are required.' });
    const role = b.role === 'admin' ? 'admin' : 'staff';
    const r = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: svc, body: JSON.stringify({
      email, password: pw, email_confirm: true,
      user_metadata: { username, name: String(b.name || username).trim(), role, must_change_password: true } }) });
    const j = await r.json();
    if (!r.ok) return json(400, { error: j.msg || j.message || j.error_description || 'Could not create user.' });
    return json(200, { ok: true, id: j.id });
  }

  if (b.action === 'reset') {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.user_id || ''))) return json(400, { error: 'Bad user id.' });
    const r = await fetch(`${URL}/auth/v1/admin/users/${b.user_id}`, { method: 'PUT', headers: svc, body: JSON.stringify({ password: pw }) });
    if (!r.ok) return json(400, { error: 'Could not reset password.' });
    await fetch(`${URL}/rest/v1/profiles?id=eq.${b.user_id}`, { method: 'PATCH', headers: svc, body: JSON.stringify({ must_change_password: true }) });
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown action.' });
};
