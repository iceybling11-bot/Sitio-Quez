# Sitio Verde POS — Netlify + Supabase edition

Static front end (no build framework) on **Netlify**, database/auth/file storage on **Supabase**, code on **GitHub**.
Converted from the Flask app: all business rules (split payments, tiered buffet pricing, discount approval, inventory
deduction/void restock, tabs/merge/transfer, reservation lifecycle, shifts, refunds) now live in Postgres functions in
`supabase/schema.sql`, so they are enforced server-side, not just in the browser.

## Deploy (about 10 minutes)

1. **Supabase** → new project → *SQL Editor* → paste all of `supabase/schema.sql` → Run.
2. **Supabase → Authentication → Users → Add user** (tick *Auto Confirm*). **The first user created becomes the admin.**
   Optionally turn off public sign-ups: *Authentication → Providers → Email → disable "Allow new users to sign up"*.
3. **GitHub** → push this folder to a repo.
4. **Netlify** → *Add new site → Import from Git* → pick the repo (settings are read from `netlify.toml`).
   Add environment variables (Site configuration → Environment variables):
   | Name | Value (Supabase → Project Settings → API) |
   |---|---|
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_ANON_KEY` | `anon` public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **secret**, used only by the staff-account function |
5. Deploy, open the site, sign in with the admin user. Add staff under **Staff**.

Local test: put your URL/anon key in `public/js/config.js` and serve `public/` (e.g. `npx serve public`).
The staff-account function needs `netlify dev`.

## What changed vs. the Flask version
- Login is by **email + password** (Supabase Auth) instead of username. Lockout/brute-force protection is Supabase's built-in rate limiting.
- Receipts print from the browser (80 mm layout, *Print → Save as PDF*). Reports export **CSV** and print to PDF; the Excel/PDF server exports were dropped.
- Proof-of-payment files go to a **private** Supabase Storage bucket (`proofs`), opened via 5-minute signed links.
- Kitchen items created by reservation billing no longer clutter the kitchen queue.
- Backup button exports JSON; use Supabase's own backups for real disaster recovery.

## Repairs made while converting
- Netlify can't run Flask/gunicorn, and SQLite/uploaded files vanish on serverless — replaced with Postgres + Storage.
- Removed the duplicate `sitio_verde_fixed/` copy (identical code) and the unused imports flagged by pyflakes.
- Queue numbers reset per Manila day (was server-timezone dependent); stock check, deduction and sale insert are now one atomic transaction (no more race that could oversell stock).
- Row Level Security on every table; staff can't write sales/payments/inventory directly, only through the functions.
- **Privacy:** the original zip contained two uploaded payment-proof images committed in `app/static/uploads/` (publicly served). They are NOT included; delete them from your old GitHub repo history if it is public.
- Not carried over: VAT is still 0 and this is not a BIR-accredited POS (same caveat as the original README).

## Tested / not tested
- `schema.sql` was run against a real Postgres 16 (Supabase auth/storage stubbed): checkout, stock rejection, approval, void/restock, refunds, tabs, reservations + final billing, shifts, dashboard/report functions.
- Front-end JS passes syntax and undefined-variable linting, but **I could not click through it in a browser** here. Expect to report small UI bugs on first run.
