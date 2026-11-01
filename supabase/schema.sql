-- Sitio Verde POS - Supabase schema. Run once in Supabase > SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / ON CONFLICT.

-- ---------- Tables ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  name text,
  role text not null default 'staff' check (role in ('admin','staff')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null, phone text, email text, preferred_events text, notes text,
  created_at timestamptz not null default now()
);
create table if not exists categories (
  id bigint generated always as identity primary key, name text unique not null
);
create table if not exists suppliers (
  id bigint generated always as identity primary key, name text not null, contact text
);
create table if not exists inventory_items (
  id bigint generated always as identity primary key,
  name text not null, quantity numeric not null default 0 check (quantity >= 0),
  unit text default 'pcs', low_stock_threshold numeric default 5,
  supplier_id bigint references suppliers(id) on delete set null
);
create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null, category_id bigint references categories(id) on delete set null,
  selling_price numeric(12,2) default 0, cost_price numeric(12,2) default 0,
  description text, barcode text unique, available boolean default true,
  is_buffet boolean default false
);
create table if not exists buffet_tiers (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  tier text not null check (tier in ('adult','senior','pwd','kids','free')),
  price numeric(12,2) not null default 0,
  unique (product_id, tier)
);
create table if not exists recipes (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  inventory_item_id bigint not null references inventory_items(id) on delete cascade,
  quantity_per_unit numeric not null default 0
);

create table if not exists reservations (
  id bigint generated always as identity primary key,
  reservation_number text unique not null, inquiry_number text,
  customer_id bigint references customers(id) on delete set null,
  date date not null, time time not null,
  status text not null default 'Reserved'
    check (status in ('Reserved','Confirmed','Checked In','Completed','Cancelled','No Show')),
  customer_name text not null, phone text, email text, pax int not null check (pax > 0),
  event_type text, special_requests text, assigned_staff text,
  confirmed_by text, date_confirmed timestamptz,
  down_payment numeric(12,2) default 0,
  arrival_time timestamptz, actual_pax int,
  total_bill numeric(12,2) default 0, remaining_balance numeric(12,2) default 0,
  billing_requires_approval boolean default false,
  billing_approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists reservation_payments (
  id bigint generated always as identity primary key,
  reservation_id bigint not null references reservations(id) on delete cascade,
  payment_type text check (payment_type in ('down_payment','final_payment')),
  method text, amount numeric(12,2) not null default 0, reference_number text,
  status text not null default 'Pending' check (status in ('Pending','Verified','Rejected')),
  paid_at timestamptz not null default now(), verified_by text
);
create table if not exists reservation_attachments (
  id bigint generated always as identity primary key,
  reservation_id bigint not null references reservations(id) on delete cascade,
  file_path text not null, uploaded_at timestamptz not null default now()
);

create table if not exists dining_sessions (
  id bigint generated always as identity primary key,
  session_number text unique not null,
  status text not null default 'open' check (status in ('open','closed')),
  customer_id bigint references customers(id), customer_name text,
  pax int default 1, reservation_id bigint references reservations(id),
  opened_by uuid references profiles(id),
  opened_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists restaurant_tables (
  id bigint generated always as identity primary key,
  name text not null, capacity int default 4,
  status text not null default 'available'
    check (status in ('available','occupied','reserved','cleaning')),
  merged_into_id bigint references restaurant_tables(id) on delete set null,
  session_id bigint references dining_sessions(id) on delete set null
);

create table if not exists sales (
  id bigint generated always as identity primary key,
  sale_number text unique not null,
  customer_id bigint references customers(id), customer_name text,
  is_walkin boolean default false, queue_number text,
  table_id bigint references restaurant_tables(id) on delete set null,
  dining_session_id bigint references dining_sessions(id),
  is_tab boolean default false,
  reservation_id bigint references reservations(id),
  subtotal numeric(12,2) default 0, discount numeric(12,2) default 0,
  discount_type text default 'none', senior_pwd_savings numeric(12,2) default 0,
  vat numeric(12,2) default 0, total numeric(12,2) default 0,
  amount_tendered numeric(12,2) default 0, change numeric(12,2) default 0,
  status text not null default 'completed' check (status in ('open','completed','voided')),
  void_reason text, voided_by uuid references profiles(id),
  requires_approval boolean default false, approved_by uuid references profiles(id),
  cashier_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists sales_created_idx on sales(created_at);
create table if not exists sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  product_name text, quantity int default 1,
  price numeric(12,2) default 0, line_total numeric(12,2) default 0,
  is_buffet boolean default false,
  buffet_adult int default 0, buffet_senior int default 0, buffet_pwd int default 0,
  buffet_kids int default 0, buffet_free int default 0,
  kitchen_status text not null default 'preparing'
    check (kitchen_status in ('preparing','ready','served','completed'))
);
create table if not exists sale_payments (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales(id) on delete cascade,
  method text, amount numeric(12,2) not null default 0, reference_number text,
  created_at timestamptz not null default now()
);
create table if not exists sale_refunds (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales(id) on delete cascade,
  amount numeric(12,2) not null, reason text,
  refund_type text default 'partial' check (refund_type in ('partial','void')),
  method text, refunded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists sale_attachments (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales(id) on delete cascade,
  file_path text not null, uploaded_at timestamptz not null default now()
);

create table if not exists inventory_transactions (
  id bigint generated always as identity primary key,
  item_id bigint not null references inventory_items(id) on delete cascade,
  type text check (type in ('in','out','adjustment','sale_deduction','void_reversal','waste','spoilage')),
  quantity numeric default 0, reference text, note text,
  user_id uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists expenses (
  id bigint generated always as identity primary key,
  category text, description text, amount numeric(12,2) default 0,
  date date not null default current_date, recorded_by uuid references profiles(id)
);
create table if not exists settings (key text primary key, value text);
create table if not exists activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id), action text,
  created_at timestamptz not null default now()
);
create table if not exists cashier_shifts (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  opening_cash numeric(12,2) default 0, closing_cash_counted numeric(12,2),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(), closed_at timestamptz,
  notes text, approved_by uuid references profiles(id)
);
create table if not exists notifications (
  id bigint generated always as identity primary key,
  type text, message text, is_read boolean default false, related_id bigint,
  user_id uuid references profiles(id), dedupe_key text,
  created_at timestamptz not null default now()
);
create index if not exists notif_dedupe_idx on notifications(dedupe_key);

-- ---------- Helpers ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;
create or replace function log_activity(p_action text) returns void
language sql security definer set search_path = public as $$
  insert into activity_logs(user_id, action) values (auth.uid(), p_action);
$$;
create or replace function notify(p_type text, p_msg text, p_related bigint, p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_key is not null then
    update notifications set message = p_msg, created_at = now()
      where dedupe_key = p_key and not is_read;
    if found then return; end if;
  end if;
  insert into notifications(type, message, related_id, dedupe_key) values (p_type, p_msg, p_related, p_key);
end $$;
create or replace function check_low_stock() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select * from inventory_items where quantity <= low_stock_threshold loop
    perform notify('low_inventory', format('Low stock: %s (%s %s left)', r.name, r.quantity, r.unit), r.id, 'low_stock:' || r.id);
  end loop;
end $$;
create or replace function short_code(n int) returns text
language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text,'-',''),1,n));
$$;

-- ---------- Row Level Security ----------
do $$ declare t text; begin
  for t in select unnest(array['profiles','customers','categories','suppliers','inventory_items','products',
    'buffet_tiers','recipes','reservations','reservation_payments','reservation_attachments','dining_sessions',
    'restaurant_tables','sales','sale_items','sale_payments','sale_refunds','sale_attachments',
    'inventory_transactions','expenses','settings','activity_logs','cashier_shifts','notifications'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read_%1$s" on %1$I', t);
    execute format('create policy "read_%1$s" on %1$I for select to authenticated using (is_staff())', t);
  end loop;
end $$;

-- Direct writes from the browser are limited to admins on these tables
do $$ declare t text; begin
  for t in select unnest(array['categories','products','buffet_tiers','recipes','suppliers','inventory_items','settings','restaurant_tables','expenses'])
  loop
    execute format('drop policy if exists "admin_write_%1$s" on %1$I', t);
    execute format('create policy "admin_write_%1$s" on %1$I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
-- Staff-level writes
drop policy if exists "customers_insert" on customers;
create policy "customers_insert" on customers for insert to authenticated with check (is_staff());
drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers for update to authenticated using (is_staff());
drop policy if exists "notif_update" on notifications;
create policy "notif_update" on notifications for update to authenticated using (is_staff());
drop policy if exists "kitchen_update" on sale_items;
create policy "kitchen_update" on sale_items for update to authenticated using (is_staff());
drop policy if exists "resatt_insert" on reservation_attachments;
create policy "resatt_insert" on reservation_attachments for insert to authenticated with check (is_staff());
drop policy if exists "salatt_insert" on sale_attachments;
create policy "salatt_insert" on sale_attachments for insert to authenticated with check (is_staff());
-- (everything else - sales, payments, inventory, sessions, reservations - is written only by the functions below)

-- ---------- Private storage bucket for proof-of-payment ----------
insert into storage.buckets (id, name, public) values ('proofs','proofs', false) on conflict (id) do nothing;
drop policy if exists "proofs_rw" on storage.objects;
create policy "proofs_rw" on storage.objects for all to authenticated
  using (bucket_id = 'proofs' and is_staff()) with check (bucket_id = 'proofs' and is_staff());

-- ---------- Auth hook: create a profile for every new auth user ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, username, name, role, must_change_password)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          case when (select count(*) from profiles) = 0 then 'admin'   -- the very first account becomes admin
               else coalesce(new.raw_user_meta_data->>'role','staff') end,
          coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function change_password_done() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
$$;

-- ---------- Sales ----------
create or replace function deduct_inventory(p_sale bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select i.id, i.name, sum(rc.quantity_per_unit * si.quantity) need
           from sale_items si join recipes rc on rc.product_id = si.product_id
           join inventory_items i on i.id = rc.inventory_item_id
           where si.sale_id = p_sale group by i.id, i.name loop
    if r.need <= 0 then continue; end if;
    update inventory_items set quantity = greatest(0, quantity - r.need) where id = r.id;
    insert into inventory_transactions(item_id, type, quantity, reference, note, user_id)
    values (r.id, 'sale_deduction', r.need, p_sale::text, 'Sold items', auth.uid());
  end loop;
end $$;

-- p: product_id, adult, senior, pwd, kids, free, promo_discount_percent, payments [{method, amount, reference_number}],
--    is_walkin, table_id, customer_id, customer_name, reservation_id, has_proof
create or replace function checkout(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prod products%rowtype;
  v_adult int := coalesce((p->>'adult')::int,0);  v_senior int := coalesce((p->>'senior')::int,0);
  v_pwd int := coalesce((p->>'pwd')::int,0);      v_kids int := coalesce((p->>'kids')::int,0);
  v_free int := coalesce((p->>'free')::int,0);
  v_pax int; pa numeric; ps numeric; pp numeric; pk numeric;
  v_sub numeric; v_sav numeric; v_pct numeric; v_disc numeric; v_total numeric;
  v_paid numeric := 0; v_tab boolean := false; v_session bigint; v_tbl restaurant_tables%rowtype;
  v_needs_ref boolean := false; v_req boolean; v_sale sales%rowtype;
  pay jsonb; m text; r record; v_queue text;
  v_walkin boolean := coalesce((p->>'is_walkin')::boolean,false);
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into v_prod from products where id = (p->>'product_id')::bigint and is_buffet;
  if not found then raise exception 'Select a valid buffet package'; end if;
  if least(v_adult,v_senior,v_pwd,v_kids,v_free) < 0 then raise exception 'Guest counts cannot be negative.'; end if;
  v_pax := v_adult+v_senior+v_pwd+v_kids+v_free;
  if v_pax <= 0 then raise exception 'Enter at least 1 guest'; end if;
  if v_pax > 500 then raise exception 'Guest count looks too large for a single sale. Please split into multiple sales.'; end if;

  select coalesce(max(price) filter (where tier='adult'),0), coalesce(max(price) filter (where tier='senior'),0),
         coalesce(max(price) filter (where tier='pwd'),0),   coalesce(max(price) filter (where tier='kids'),0)
    into pa, ps, pp, pk from buffet_tiers where product_id = v_prod.id;
  v_sub := round(v_adult*pa + v_senior*ps + v_pwd*pp + v_kids*pk, 2);
  v_sav := round((pa-ps)*v_senior + (pa-pp)*v_pwd, 2);

  -- Reject BEFORE writing anything if stock is short
  for r in select i.name, i.unit, i.quantity, sum(rc.quantity_per_unit * v_pax) as need
           from recipes rc join inventory_items i on i.id = rc.inventory_item_id
           where rc.product_id = v_prod.id group by i.id loop
    if r.need > r.quantity + 1e-9 then
      raise exception 'Not enough stock to complete this sale (%: need % %, have % %).', r.name, r.need, r.unit, r.quantity, r.unit;
    end if;
  end loop;

  v_pct := greatest(0, least(100, coalesce((p->>'promo_discount_percent')::numeric,0)));
  v_disc := round(v_sub * v_pct / 100, 2);
  v_total := greatest(0, v_sub - v_disc);

  if coalesce(p->>'table_id','') <> '' then
    select * into v_tbl from restaurant_tables where id = (p->>'table_id')::bigint for update;
    if found and v_tbl.session_id is not null then v_tab := true; v_session := v_tbl.session_id; end if;
  end if;

  for pay in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    m := lower(trim(coalesce(pay->>'method','')));
    if m not in ('cash','gcash','credit card') then raise exception '% is not a recognized payment method.', pay->>'method'; end if;
    if coalesce((pay->>'amount')::numeric,0) < 0 then raise exception 'Payment amounts cannot be negative.'; end if;
    if m = 'gcash' then
      if coalesce(trim(pay->>'reference_number'),'') = '' then raise exception 'A reference number is required for GCash payments.'; end if;
      v_needs_ref := true;
    end if;
    v_paid := v_paid + coalesce((pay->>'amount')::numeric,0);
  end loop;
  if not v_tab and v_paid <= 0 then raise exception 'Please enter at least one payment before completing the sale.'; end if;
  if not v_tab and v_paid + 0.01 < v_total then raise exception 'Payment (%) is less than the total bill (%).', v_paid, v_total; end if;
  if v_needs_ref and not coalesce((p->>'has_proof')::boolean,false) then
    raise exception 'Please attach proof of payment (screenshot/receipt) for GCash payments.';
  end if;

  v_req := not is_admin() and (v_disc > 1000 or
           v_pct > coalesce((select value::numeric from settings where key='max_staff_discount_percent'),10));

  if v_walkin then
    select 'Q-' || lpad((count(*)+1)::text,3,'0') into v_queue from sales
     where is_walkin and created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
  end if;

  insert into sales(sale_number, customer_id, customer_name, is_walkin, queue_number, table_id, dining_session_id, is_tab,
                    reservation_id, subtotal, discount, discount_type, senior_pwd_savings, total, amount_tendered, change,
                    status, requires_approval, cashier_id)
  values ('SALE-' || short_code(8), nullif(p->>'customer_id','')::bigint,
          coalesce(nullif(p->>'customer_name',''), case when v_walkin then 'Walk-in' else 'Guest' end),
          v_walkin, v_queue, v_tbl.id, v_session, v_tab, nullif(p->>'reservation_id','')::bigint,
          v_sub, v_disc, case when v_disc > 0 then 'promo' else 'none' end, v_sav, v_total, v_paid, greatest(0, v_paid - v_total),
          case when v_req then 'open' else 'completed' end, v_req, auth.uid())
  returning * into v_sale;

  insert into sale_items(sale_id, product_id, product_name, quantity, price, line_total, is_buffet,
                         buffet_adult, buffet_senior, buffet_pwd, buffet_kids, buffet_free)
  values (v_sale.id, v_prod.id, v_prod.name, v_pax, pa, v_sub, true, v_adult, v_senior, v_pwd, v_kids, v_free);

  for pay in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    insert into sale_payments(sale_id, method, amount, reference_number)
    values (v_sale.id, pay->>'method', coalesce((pay->>'amount')::numeric,0), nullif(pay->>'reference_number',''));
  end loop;

  if not v_req then perform deduct_inventory(v_sale.id); end if;
  if v_tbl.id is not null and not v_tab then update restaurant_tables set status = 'occupied' where id = v_tbl.id; end if;

  if v_req then
    perform notify('discount_approval', format('Sale %s needs approval: discount PHP %s', v_sale.sale_number, v_disc), v_sale.id);
  else
    perform check_low_stock();
  end if;
  perform log_activity(format('%s sale %s (PHP %s)', case when v_req then 'Created pending' else 'Completed' end, v_sale.sale_number, v_total));
  return jsonb_build_object('sale_id', v_sale.id, 'sale_number', v_sale.sale_number, 'requires_approval', v_req, 'total', v_total);
end $$;

create or replace function approve_sale(p_sale bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into s from sales where id = p_sale for update;
  if not found or s.status <> 'open' then raise exception 'Sale is not awaiting approval'; end if;
  update sales set status = 'completed', approved_by = auth.uid() where id = p_sale;
  perform deduct_inventory(p_sale);
  if s.reservation_id is not null then
    update reservations set status = 'Completed', billing_requires_approval = false, billing_approved_by = auth.uid()
      where id = s.reservation_id;
  end if;
  perform check_low_stock();
  perform log_activity('Approved sale ' || s.sale_number);
end $$;

create or replace function void_sale(p_sale bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; t record; v_refundable numeric;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status = 'voided' then raise exception 'Sale already voided.'; end if;
  for t in select * from inventory_transactions where reference = p_sale::text and type = 'sale_deduction' loop
    update inventory_items set quantity = quantity + t.quantity where id = t.item_id;
    insert into inventory_transactions(item_id, type, quantity, reference, note, user_id)
    values (t.item_id, 'void_reversal', t.quantity, p_sale::text, 'Void of sale ' || s.sale_number || ': ' || coalesce(p_reason,''), auth.uid());
  end loop;
  select greatest(0, coalesce((select sum(amount) from sale_payments where sale_id = p_sale),0)
                   - coalesce((select sum(amount) from sale_refunds where sale_id = p_sale),0)) into v_refundable;
  if v_refundable > 0 then
    insert into sale_refunds(sale_id, amount, reason, refund_type, method, refunded_by)
    values (p_sale, v_refundable, p_reason, 'void', 'reversal', auth.uid());
  end if;
  update sales set status = 'voided', void_reason = coalesce(nullif(p_reason,''),'No reason given'), voided_by = auth.uid()
   where id = p_sale;
  if s.table_id is not null and s.dining_session_id is null then
    update restaurant_tables set status = 'cleaning' where id = s.table_id;
  end if;
  perform log_activity(format('Voided sale %s: %s (refunded PHP %s)', s.sale_number, p_reason, v_refundable));
end $$;

create or replace function refund_sale(p_sale bigint, p_amount numeric, p_reason text, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_refundable numeric;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status = 'voided' then raise exception 'This sale is already voided.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Refund amount must be greater than zero.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Please provide a reason for the refund.'; end if;
  select coalesce((select sum(amount) from sale_payments where sale_id = p_sale),0)
       - coalesce((select sum(amount) from sale_refunds where sale_id = p_sale),0) into v_refundable;
  if p_amount > v_refundable then raise exception 'Refund (%) exceeds what can still be refunded (%).', p_amount, v_refundable; end if;
  insert into sale_refunds(sale_id, amount, reason, refund_type, method, refunded_by)
  values (p_sale, p_amount, p_reason, 'partial', coalesce(p_method,'Cash'), auth.uid());
  perform log_activity(format('Refunded PHP %s on sale %s: %s', p_amount, s.sale_number, p_reason));
end $$;

-- ---------- Inventory: op = in | out | adjust | waste | spoilage ----------
create or replace function inventory_op(p_item bigint, p_op text, p_qty numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare i inventory_items%rowtype; v_diff numeric;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into i from inventory_items where id = p_item for update;
  if not found then raise exception 'Item not found'; end if;
  if p_op = 'adjust' then
    if p_qty is null or p_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
    v_diff := p_qty - i.quantity;
    update inventory_items set quantity = p_qty where id = p_item;
    insert into inventory_transactions(item_id, type, quantity, note, user_id)
    values (p_item,'adjustment',v_diff,coalesce(nullif(p_note,''),'Manual adjustment'),auth.uid());
  else
    if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
    if p_op in ('waste','spoilage') and coalesce(trim(p_note),'') = '' then
      raise exception 'Please provide a reason (e.g. spoiled, dropped, expired).'; end if;
    if p_op = 'in' then
      update inventory_items set quantity = quantity + p_qty where id = p_item;
    elsif p_op in ('out','waste','spoilage') then
      if p_qty > i.quantity then raise exception 'Only % % of % on hand.', i.quantity, i.unit, i.name; end if;
      update inventory_items set quantity = quantity - p_qty where id = p_item;
    else raise exception 'Unknown operation'; end if;
    insert into inventory_transactions(item_id, type, quantity, note, user_id) values (p_item,p_op,p_qty,p_note,auth.uid());
  end if;
  perform check_low_stock();
  perform log_activity(format('Inventory %s: %s %s', p_op, i.name, p_qty));
end $$;

-- ---------- Tables / dining sessions ----------
create or replace function open_table(p_table bigint, p_pax int, p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare t restaurant_tables%rowtype; sid bigint;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into t from restaurant_tables where id = p_table for update;
  if not found then raise exception 'Table not found'; end if;
  if t.session_id is not null then return t.session_id; end if;
  if t.status not in ('available','reserved') then raise exception '% is not available to seat.', t.name; end if;
  insert into dining_sessions(session_number, customer_name, pax, opened_by)
  values ('TAB-' || short_code(6), coalesce(nullif(p_name,''),'Walk-in'), greatest(1,coalesce(p_pax,1)), auth.uid())
  returning id into sid;
  update restaurant_tables set session_id = sid, status = 'occupied' where id = p_table;
  perform log_activity('Opened table ' || t.name);
  return sid;
end $$;

create or replace function set_table_status(p_table bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if p_status not in ('available','occupied','reserved','cleaning') then raise exception 'Invalid status'; end if;
  if p_status in ('available','cleaning') then
    update restaurant_tables set status = p_status, session_id = null, merged_into_id = null where id = p_table;
  else
    update restaurant_tables set status = p_status where id = p_table;
  end if;
end $$;

create or replace function close_session(p_session bigint, p_amount numeric, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare s dining_sessions%rowtype; v_billed numeric; v_paid numeric; v_balance numeric; v_target bigint;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into s from dining_sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status = 'closed' then raise exception 'This session is already closed.'; end if;
  select coalesce(sum(total),0) into v_billed from sales where dining_session_id = p_session and status <> 'voided';
  select coalesce((select sum(pm.amount) from sale_payments pm join sales x on x.id = pm.sale_id
                    where x.dining_session_id = p_session and x.status <> 'voided'),0)
       - coalesce((select sum(rf.amount) from sale_refunds rf join sales x on x.id = rf.sale_id
                    where x.dining_session_id = p_session and x.status <> 'voided'),0) into v_paid;
  v_balance := greatest(0, v_billed - v_paid);
  if v_balance > 0 then
    if coalesce(p_amount,0) + 0.01 < v_balance then
      raise exception 'Payment (%) does not cover the remaining balance (%).', coalesce(p_amount,0), v_balance; end if;
    select id into v_target from sales where dining_session_id = p_session and status <> 'voided' order by id desc limit 1;
    if v_target is not null then
      insert into sale_payments(sale_id, method, amount) values (v_target, coalesce(p_method,'Cash'), p_amount);
    end if;
  end if;
  update dining_sessions set status = 'closed', closed_at = now() where id = p_session;
  update restaurant_tables set session_id = null, merged_into_id = null, status = 'cleaning' where session_id = p_session;
  perform log_activity('Closed session ' || s.session_number);
end $$;

create or replace function transfer_table(p_source bigint, p_dest bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s restaurant_tables%rowtype; d restaurant_tables%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into s from restaurant_tables where id = p_source for update;
  select * into d from restaurant_tables where id = p_dest for update;
  if d.status <> 'available' then raise exception 'Destination table is not available.'; end if;
  if s.session_id is null then raise exception '% has no open session to transfer.', s.name; end if;
  update restaurant_tables set session_id = s.session_id, status = 'occupied' where id = p_dest;
  update restaurant_tables set session_id = null, merged_into_id = null, status = 'cleaning' where id = p_source;
  update sales set table_id = p_dest where dining_session_id = s.session_id and table_id = p_source;
  perform log_activity(format('Transferred table %s -> %s', s.name, d.name));
end $$;

create or replace function merge_tables(p_ids bigint[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_primary bigint := p_ids[1]; v_sid bigint; t restaurant_tables%rowtype; v_pax int := 0;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(array_length(p_ids,1),0) < 2 then raise exception 'Select at least two tables to merge.'; end if;
  select session_id into v_sid from restaurant_tables
   where id = any(p_ids) and session_id is not null order by (id = v_primary) desc limit 1;
  for t in select * from restaurant_tables where id = any(p_ids) for update loop
    if t.session_id is not null and t.session_id is distinct from v_sid then
      raise exception '% already has its own open session - close or transfer it before merging.', t.name;
    end if;
    v_pax := v_pax + coalesce(t.capacity,0);
  end loop;
  if v_sid is null then
    insert into dining_sessions(session_number, customer_name, pax, opened_by)
    values ('TAB-' || short_code(6), 'Walk-in', greatest(1,v_pax), auth.uid()) returning id into v_sid;
  end if;
  update restaurant_tables set session_id = v_sid, status = 'occupied',
         merged_into_id = case when id = v_primary then null else v_primary end where id = any(p_ids);
  perform log_activity('Merged tables into session ' || v_sid);
  return v_sid;
end $$;

-- ---------- Reservations ----------
create or replace function create_reservation(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_cust bigint; v_id bigint; v_dp numeric := coalesce((p->>'down_payment')::numeric,0); v_num text;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if coalesce((p->>'pax')::int,0) < 1 then raise exception 'Guest count must be at least 1.'; end if;
  if v_dp < 0 then raise exception 'Down payment cannot be negative.'; end if;
  if v_dp > 0 and lower(coalesce(p->>'payment_method','cash')) not in ('cash','gcash','bank transfer','card','credit card') then
    raise exception 'Unrecognized payment method.'; end if;
  if coalesce(p->>'phone','') <> '' then select id into v_cust from customers where phone = p->>'phone' limit 1; end if;
  if v_cust is null then
    insert into customers(name, phone, email)
    values (p->>'customer_name', nullif(p->>'phone',''), nullif(p->>'email','')) returning id into v_cust;
  end if;
  v_num := 'RES-' || short_code(6);
  insert into reservations(reservation_number, inquiry_number, customer_id, date, time, customer_name, phone, email, pax,
                           event_type, special_requests, assigned_staff, down_payment)
  values (v_num, nullif(p->>'inquiry_number',''), v_cust, (p->>'date')::date, (p->>'time')::time, p->>'customer_name',
          nullif(p->>'phone',''), nullif(p->>'email',''), (p->>'pax')::int, nullif(p->>'event_type',''),
          nullif(p->>'special_requests',''), nullif(p->>'assigned_staff',''), v_dp) returning id into v_id;
  if v_dp > 0 then
    insert into reservation_payments(reservation_id, payment_type, method, amount, reference_number, status)
    values (v_id, 'down_payment', coalesce(p->>'payment_method','Cash'), v_dp, nullif(p->>'reference_number',''), 'Pending');
  end if;
  perform notify('new_reservation', format('New reservation %s by %s', v_num, p->>'customer_name'), v_id);
  perform log_activity('Created reservation ' || v_num);
  return v_id;
end $$;

create or replace function reservation_action(p_id bigint, p_action text, p_actual_pax int default null) returns void
language plpgsql security definer set search_path = public as $$
declare r reservations%rowtype; v_name text;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into r from reservations where id = p_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  select coalesce(name, username) into v_name from profiles where id = auth.uid();
  if p_action = 'confirm' and r.status = 'Reserved' then
    update reservations set status='Confirmed', confirmed_by=v_name, date_confirmed=now() where id=p_id;
  elsif p_action = 'cancel' and r.status in ('Reserved','Confirmed') then
    update reservations set status='Cancelled' where id=p_id;
    perform notify('cancelled_reservation', format('Reservation %s was cancelled', r.reservation_number), p_id);
  elsif p_action = 'no_show' and r.status in ('Reserved','Confirmed') then
    update reservations set status='No Show' where id=p_id;
  elsif p_action = 'checkin' and r.status = 'Confirmed' then
    if coalesce(p_actual_pax, r.pax) < 1 then raise exception 'Actual guest count must be at least 1.'; end if;
    update reservations set status='Checked In', arrival_time=now(), actual_pax=coalesce(p_actual_pax, r.pax) where id=p_id;
  else
    raise exception 'Cannot % a reservation that is currently "%".', replace(p_action,'_','-'), r.status;
  end if;
  perform log_activity(format('Reservation %s: %s', r.reservation_number, p_action));
end $$;

create or replace function verify_reservation_payment(p_payment bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('Verified','Rejected') then raise exception 'Invalid status'; end if;
  update reservation_payments set status = p_status,
         verified_by = (select coalesce(name, username) from profiles where id = auth.uid()) where id = p_payment;
  perform log_activity(format('%s reservation payment #%s', p_status, p_payment));
end $$;

create or replace function final_billing(p_id bigint, p_total numeric, p_paid numeric, p_method text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservations%rowtype; v_guests int; v_std numeric; v_needs boolean := false; v_dp numeric; v_remaining numeric;
        v_sale bigint; m text := lower(coalesce(p_method,'cash')); v_num text; v_nm text;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into r from reservations where id = p_id for update;
  if not found or r.status <> 'Checked In' then raise exception 'Only a Checked In reservation can be billed.'; end if;
  if p_total < 0 or p_paid < 0 then raise exception 'Total bill and amount paid cannot be negative.'; end if;
  if m not in ('cash','gcash','bank transfer','card','credit card','mixed payment') then
    raise exception 'Unrecognized payment method.'; end if;
  if m in ('gcash','bank transfer') and coalesce(trim(p_ref),'') = '' then
    raise exception 'A reference number is required for % payments.', p_method; end if;
  v_guests := coalesce(r.actual_pax, r.pax, 1);
  select t.price into v_std from buffet_tiers t join products p on p.id = t.product_id
   where p.is_buffet and p.available and t.tier = 'adult' order by p.id limit 1;
  if v_std is not null and not is_admin() and p_total < v_std * v_guests * 0.5 then v_needs := true; end if;
  select coalesce(sum(amount),0) into v_dp from reservation_payments where reservation_id = p_id and status = 'Verified';
  v_remaining := greatest(0, p_total - v_dp);
  if not v_needs and p_paid + 0.01 < v_remaining then
    raise exception 'Amount paid (%) is less than the remaining balance (%).', p_paid, v_remaining; end if;
  select coalesce(name, username) into v_nm from profiles where id = auth.uid();
  update reservations set total_bill = p_total, remaining_balance = greatest(0, v_remaining - p_paid),
         billing_requires_approval = v_needs, status = case when v_needs then status else 'Completed' end where id = p_id;
  insert into reservation_payments(reservation_id, payment_type, method, amount, reference_number, status, verified_by)
  values (p_id, 'final_payment', p_method, p_paid, nullif(p_ref,''), 'Verified', v_nm);
  v_num := 'SALE-' || short_code(8);
  insert into sales(sale_number, customer_id, customer_name, reservation_id, subtotal, total, amount_tendered, change,
                    status, requires_approval, cashier_id)
  values (v_num, r.customer_id, r.customer_name, p_id, p_total, p_total, v_dp + p_paid, greatest(0, v_dp + p_paid - p_total),
          case when v_needs then 'open' else 'completed' end, v_needs, auth.uid()) returning id into v_sale;
  insert into sale_items(sale_id, product_name, quantity, price, line_total, kitchen_status)
  values (v_sale, format('Reservation Buffet (%s guests)', v_guests), v_guests,
          round(p_total / greatest(v_guests,1), 2), p_total, 'completed');
  insert into sale_payments(sale_id, method, amount, reference_number) values (v_sale, p_method, p_paid, nullif(p_ref,''));
  if v_dp > 0 then insert into sale_payments(sale_id, method, amount) values (v_sale, 'Down Payment', v_dp); end if;
  if v_needs then
    perform notify('discount_approval', format('Reservation %s final bill (PHP %s) needs admin approval', r.reservation_number, p_total), v_sale);
  end if;
  perform log_activity('Final billing for reservation ' || r.reservation_number);
  return jsonb_build_object('sale_id', v_sale, 'requires_approval', v_needs);
end $$;

-- ---------- Cashier shifts ----------
create or replace function open_shift(p_opening numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if exists (select 1 from cashier_shifts where user_id = auth.uid() and status = 'open') then
    raise exception 'You already have an open shift.'; end if;
  if coalesce(p_opening,0) < 0 then raise exception 'Opening cash cannot be negative.'; end if;
  insert into cashier_shifts(user_id, opening_cash) values (auth.uid(), coalesce(p_opening,0)) returning id into v_id;
  return v_id;
end $$;
create or replace function close_shift(p_id bigint, p_counted numeric, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the counted cash.'; end if;
  update cashier_shifts set status='closed', closed_at=now(), closing_cash_counted=p_counted, notes=p_notes
   where id = p_id and status='open' and (user_id = auth.uid() or is_admin());
  if not found then raise exception 'Shift not found or already closed.'; end if;
end $$;
create or replace function approve_shift(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update cashier_shifts set approved_by = auth.uid() where id = p_id and status = 'closed';
end $$;

-- Expected cash for a shift: opening float + cash taken in - refunds, over the shift window
create or replace function shift_summary(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s cashier_shifts%rowtype; v_end timestamptz; v_cash numeric; v_ref numeric; v_methods jsonb;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into s from cashier_shifts where id = p_id;
  if not found then raise exception 'Shift not found'; end if;
  if s.user_id <> auth.uid() and not is_admin() then raise exception 'Not allowed'; end if;
  v_end := coalesce(s.closed_at, now());
  select coalesce(sum(pm.amount) filter (where lower(pm.method) = 'cash'),0) into v_cash
    from sale_payments pm join sales x on x.id = pm.sale_id
   where x.cashier_id = s.user_id and x.status = 'completed' and x.created_at between s.opened_at and v_end;
  select coalesce(sum(rf.amount),0) into v_ref from sale_refunds rf join sales x on x.id = rf.sale_id
   where x.cashier_id = s.user_id and x.status = 'completed' and x.created_at between s.opened_at and v_end;
  select coalesce(jsonb_object_agg(m, a), '{}'::jsonb) into v_methods from (
    select initcap(coalesce(pm.method,'Unknown')) m, sum(pm.amount) a
      from sale_payments pm join sales x on x.id = pm.sale_id
     where x.cashier_id = s.user_id and x.status = 'completed' and x.created_at between s.opened_at and v_end group by 1) q;
  return jsonb_build_object('cash_sales', v_cash, 'refunds', v_ref, 'by_method', v_methods,
    'expected_cash', coalesce(s.opening_cash,0) + v_cash - v_ref,
    'variance', case when s.closing_cash_counted is null then null
                     else s.closing_cash_counted - (coalesce(s.opening_cash,0) + v_cash - v_ref) end);
end $$;

-- Admin: activate / deactivate a staff account (account creation is done by the Netlify function)
create or replace function set_user_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot deactivate your own account.'; end if;
  update profiles set active = p_active where id = p_user;
end $$;

-- Function execution: signed-in users only
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- ---------- Seed data ----------
insert into settings(key, value) values
  ('restaurant_name','Sitio Verde Buffet Restaurant'),
  ('receipt_footer','Thank you for dining with us!'),
  ('max_staff_discount_percent','10')
on conflict (key) do nothing;
insert into categories(name) values ('Buffet') on conflict (name) do nothing;
insert into suppliers(name, contact)
  select 'Green Valley Meat & Produce','0917-000-0000' where not exists (select 1 from suppliers);
insert into inventory_items(name, quantity, unit, low_stock_threshold, supplier_id)
  select 'Rice', 100, 'kg', 15, (select id from suppliers limit 1) where not exists (select 1 from inventory_items);
insert into products(name, category_id, is_buffet)
  select 'Unlimited Buffet', (select id from categories where name='Buffet'), true
   where not exists (select 1 from products where is_buffet);
insert into buffet_tiers(product_id, tier, price)
  select p.id, v.tier, v.price
    from (select id from products where is_buffet order by id limit 1) p,
         (values ('adult',599.00),('senior',479.20),('pwd',479.20),('kids',449.00),('free',0.00)) v(tier, price)
on conflict (product_id, tier) do nothing;
insert into recipes(product_id, inventory_item_id, quantity_per_unit)
  select p.id, i.id, 0.3
    from (select id from products where is_buffet order by id limit 1) p,
         (select id from inventory_items where name='Rice' limit 1) i
   where not exists (select 1 from recipes);
insert into restaurant_tables(name, capacity)
  select 'T' || g, case when g % 2 = 1 then 4 else 6 end from generate_series(1,8) g
   where not exists (select 1 from restaurant_tables);

-- ---------- Dashboard & reports (server-side so totals aren't capped by the 1000-row API limit) ----------
create or replace function dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := 'Asia/Manila';
  v_today date := (now() at time zone tz)::date;
  v_day_start timestamptz := (v_today::timestamp at time zone tz);
  v_month_start timestamptz := (date_trunc('month', v_today::timestamp) at time zone tz);
  v_days jsonb; v_res jsonb; v_best text;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select jsonb_agg(jsonb_build_object('label', to_char(g, 'Dy'),
           'total', coalesce((select sum(total) from sales where status='completed'
              and (created_at at time zone tz)::date = g),0)) order by g)
    into v_days from generate_series(v_today - 6, v_today, interval '1 day') g;
  select jsonb_agg(jsonb_build_object('label', s, 'count', (select count(*) from reservations where status = s)))
    into v_res from unnest(array['Reserved','Confirmed','Checked In','Completed','Cancelled','No Show']) s;
  select si.product_name into v_best from sale_items si join sales x on x.id = si.sale_id
   where x.status='completed' and x.created_at >= v_month_start group by si.product_name order by sum(si.quantity) desc limit 1;
  return jsonb_build_object(
    'today_sales', coalesce((select sum(total) from sales where status='completed' and created_at >= v_day_start),0),
    'monthly', coalesce((select sum(total) from sales where status='completed' and created_at >= v_month_start),0),
    'today_reservations', (select count(*) from reservations where date = v_today),
    'occupied_tables', (select count(*) from restaurant_tables where status='occupied'),
    'upcoming', (select count(*) from reservations where date > v_today and status in ('Reserved','Confirmed')),
    'low_stock', (select count(*) from inventory_items where quantity <= low_stock_threshold),
    'best_seller', coalesce(v_best,'N/A'),
    'sales_chart', coalesce(v_days,'[]'::jsonb), 'reservation_chart', coalesce(v_res,'[]'::jsonb));
end $$;

create or replace function report_summary(p_start date, p_end date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text := 'Asia/Manila'; v_from timestamptz := (p_start::timestamp at time zone tz);
        v_to timestamptz := ((p_end + 1)::timestamp at time zone tz);
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'sales_total', coalesce((select sum(total) from sales where status='completed' and created_at >= v_from and created_at < v_to),0),
    'sales_count', (select count(*) from sales where status='completed' and created_at >= v_from and created_at < v_to),
    'discounts', coalesce((select sum(discount) from sales where status='completed' and created_at >= v_from and created_at < v_to),0),
    'senior_pwd_savings', coalesce((select sum(senior_pwd_savings) from sales where status='completed' and created_at >= v_from and created_at < v_to),0),
    'refunds', coalesce((select sum(rf.amount) from sale_refunds rf where rf.created_at >= v_from and rf.created_at < v_to),0),
    'expenses', coalesce((select sum(amount) from expenses where date between p_start and p_end),0),
    'voided', (select count(*) from sales where status='voided' and created_at >= v_from and created_at < v_to),
    'by_method', coalesce((select jsonb_object_agg(m, a) from (
        select initcap(coalesce(pm.method,'Unknown')) m, sum(pm.amount) a from sale_payments pm join sales x on x.id = pm.sale_id
         where x.status='completed' and x.created_at >= v_from and x.created_at < v_to group by 1) q),'{}'::jsonb),
    'pax', (select jsonb_build_object('adult', coalesce(sum(buffet_adult),0), 'senior', coalesce(sum(buffet_senior),0),
              'pwd', coalesce(sum(buffet_pwd),0), 'kids', coalesce(sum(buffet_kids),0), 'free', coalesce(sum(buffet_free),0))
            from sale_items si join sales x on x.id = si.sale_id
            where x.status='completed' and x.created_at >= v_from and x.created_at < v_to),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', dd, 'total', t) order by dd) from (
        select (created_at at time zone tz)::date dd, sum(total) t from sales
         where status='completed' and created_at >= v_from and created_at < v_to group by 1) q),'[]'::jsonb),
    'reservations', coalesce((select jsonb_object_agg(status, c) from (
        select status, count(*) c from reservations where date between p_start and p_end group by 1) q),'{}'::jsonb));
end $$;

grant execute on function dashboard_stats(), report_summary(date, date) to authenticated;
