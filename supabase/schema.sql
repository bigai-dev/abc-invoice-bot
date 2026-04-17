-- ============================================================================
-- ABC Sdn Bhd — Automated Invoice Generator
-- Supabase PostgreSQL Schema
-- Run this ONCE in Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================================

-- ============ EXTENSIONS ============
create extension if not exists "uuid-ossp";

-- ============ TABLES ============

-- customers
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  telegram_chat_id text unique not null,
  name text not null,
  phone text not null,
  email text not null,
  address text not null,
  preferred_language text default 'en',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_customers_telegram on customers(telegram_chat_id);

-- products
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sku text unique not null,
  description text,
  price numeric(10,2) not null,
  cost numeric(10,2) default 0,
  stock integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- orders
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  order_reference text unique not null,
  invoice_number text unique,
  customer_id uuid references customers(id) on delete set null,
  telegram_chat_id text not null,
  base_amount numeric(10,2) not null,
  sst_amount numeric(10,2) not null,
  total_amount numeric(10,2) not null,
  status text default 'pending' check (status in ('pending','confirmed','cancelled')),
  delivery_status text default 'processing' check (delivery_status in ('processing','packed','out_for_delivery','delivered','none')),
  return_status text check (return_status in ('requested','refunded','rejected') or return_status is null),
  return_reason text,
  return_details text,
  screenshot_url text,
  invoice_pdf_url text,
  is_flagged boolean default false,
  created_at timestamptz default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz
);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_telegram on orders(telegram_chat_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_delivery on orders(delivery_status);

-- order_items (snapshot of prices at time of order)
create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  sku text not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) default 0,
  quantity integer not null,
  subtotal numeric(10,2) not null
);
create index if not exists idx_order_items_order on order_items(order_id);

-- reviews
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz default now()
);
create index if not exists idx_reviews_order on reviews(order_id);

-- audit_log
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor text not null,
  action text not null,
  details text,
  created_at timestamptz default now()
);
create index if not exists idx_audit_created on audit_log(created_at desc);

-- bot_sessions (for conversation state)
create table if not exists bot_sessions (
  telegram_chat_id text primary key,
  state jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- invoice_settings (single row, id=1)
create table if not exists invoice_settings (
  id integer primary key default 1,
  company_name text default 'ABC Sdn Bhd',
  ssm_number text default '20260417',
  bank_name text default 'Maybank',
  bank_account text default '12345678910',
  bank_holder text default 'ABC Sdn Bhd',
  logo_url text,
  footer_notes text default 'Thank you for your purchase!',
  sst_enabled boolean default true,
  sst_rate numeric(5,4) default 0.08,
  monthly_target numeric(10,2) default 15000,
  check (id = 1)
);

-- bot_settings (single row, id=1)
create table if not exists bot_settings (
  id integer primary key default 1,
  welcome_message text default 'Welcome to ABC Sdn Bhd! 🌿',
  pending_message text default 'Your order is being reviewed by our team.',
  confirmed_message text default 'Payment received! Here is your invoice.',
  packed_message text default '📦 Your order has been packed!',
  out_for_delivery_message text default '🚚 Your order is out for delivery!',
  delivered_message text default '✅ Your order has been delivered!',
  check (id = 1)
);

-- ============ SEED DEFAULT DATA ============

insert into invoice_settings (id) values (1) on conflict (id) do nothing;
insert into bot_settings (id) values (1) on conflict (id) do nothing;

-- Seed products (only if table is empty)
insert into products (name, sku, price, cost, stock, is_active) values
  ('Premium Bird''s Nest (6 bottles)', 'BN-006', 288.00, 180.00, 50, true),
  ('Premium Bird''s Nest (12 bottles)', 'BN-012', 528.00, 340.00, 30, true),
  ('Collagen Drink — Sakura Rose (15 sachets)', 'CL-015', 135.00, 75.00, 80, true),
  ('Collagen Drink — Sakura Rose (30 sachets)', 'CL-030', 248.00, 145.00, 60, true),
  ('Lingzhi Capsules (60 caps)', 'LZ-060', 198.00, 120.00, 40, true),
  ('Lingzhi Capsules (120 caps)', 'LZ-120', 368.00, 220.00, 25, true),
  ('Cordyceps Energy Tonic (10 bottles)', 'CD-010', 168.00, 95.00, 35, true),
  ('ABC Wellness Bundle', 'WB-001', 558.00, 360.00, 20, true)
on conflict (sku) do nothing;

-- ============ STORAGE BUCKETS ============
-- Run these in Supabase Dashboard → Storage → Create bucket
-- (Can't be done via SQL for the bucket itself, but policies below are SQL)
--
-- Buckets to create manually:
-- 1. screenshots (private)
-- 2. invoices    (private)
-- 3. logos       (public)

-- ============ ROW LEVEL SECURITY ============
-- We'll use service_role key on the server for all DB ops, which bypasses RLS.
-- Enable RLS anyway for safety so public/anon can never read directly.

alter table customers enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table reviews enable row level security;
alter table audit_log enable row level security;
alter table bot_sessions enable row level security;
alter table invoice_settings enable row level security;
alter table bot_settings enable row level security;

-- Allow anon (public) to read products only (for any public catalogue page)
drop policy if exists "Public read products" on products;
create policy "Public read products" on products for select to anon
  using (is_active = true);

-- Admin (authenticated user with matching email) can do everything on all tables
-- (We'll rely on server-side service_role key for most ops; this is belt & braces.)
drop policy if exists "Admin full access products" on products;
create policy "Admin full access products" on products for all to authenticated
  using (auth.jwt() ->> 'email' = current_setting('app.admin_email', true))
  with check (auth.jwt() ->> 'email' = current_setting('app.admin_email', true));

-- ============ HELPER FUNCTIONS ============

-- Generate next order reference: ORD-YYYYXXXX
create or replace function next_order_ref()
returns text
language plpgsql
as $$
declare
  y text := to_char(now(), 'YYYY');
  n integer;
begin
  select coalesce(max(substring(order_reference from 8)::integer), 0) + 1
  into n
  from orders
  where order_reference like 'ORD-' || y || '%';
  return 'ORD-' || y || lpad(n::text, 4, '0');
end;
$$;

-- Generate next invoice number: ABC-YYYY-XXXX
create or replace function next_invoice_no()
returns text
language plpgsql
as $$
declare
  y text := to_char(now(), 'YYYY');
  n integer;
begin
  select coalesce(max(substring(invoice_number from 10)::integer), 0) + 1
  into n
  from orders
  where invoice_number like 'ABC-' || y || '-%';
  return 'ABC-' || y || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ============ DONE ============
-- Check: select count(*) from products;  -- should return 8
