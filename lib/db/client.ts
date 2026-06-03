import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  _db = db;
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    create table if not exists customers (
      id text primary key,
      telegram_chat_id text unique not null,
      name text not null,
      phone text not null,
      email text not null,
      address text not null,
      preferred_language text default 'en',
      created_at text not null,
      updated_at text not null
    );
    create index if not exists idx_customers_telegram on customers(telegram_chat_id);

    create table if not exists products (
      id text primary key,
      name text not null,
      sku text unique not null,
      description text,
      price real not null,
      cost real default 0,
      stock integer default 0,
      is_active integer default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists orders (
      id text primary key,
      order_reference text unique not null,
      invoice_number text unique,
      customer_id text references customers(id) on delete set null,
      telegram_chat_id text not null,
      base_amount real not null,
      sst_amount real not null,
      total_amount real not null,
      status text default 'pending' check (status in ('pending','confirmed','cancelled')),
      delivery_status text default 'processing' check (delivery_status in ('processing','packed','out_for_delivery','delivered','none')),
      return_status text check (return_status in ('requested','refunded','rejected') or return_status is null),
      return_reason text,
      return_details text,
      screenshot_url text,
      invoice_pdf_url text,
      is_flagged integer default 0,
      created_at text not null,
      confirmed_at text,
      delivered_at text
    );
    create index if not exists idx_orders_customer on orders(customer_id);
    create index if not exists idx_orders_telegram on orders(telegram_chat_id);
    create index if not exists idx_orders_status on orders(status);
    create index if not exists idx_orders_delivery on orders(delivery_status);

    create table if not exists order_items (
      id text primary key,
      order_id text references orders(id) on delete cascade,
      product_id text references products(id) on delete set null,
      product_name text not null,
      sku text not null,
      unit_price real not null,
      unit_cost real default 0,
      quantity integer not null,
      subtotal real not null
    );
    create index if not exists idx_order_items_order on order_items(order_id);

    create table if not exists reviews (
      id text primary key,
      order_id text references orders(id) on delete cascade,
      customer_id text references customers(id) on delete set null,
      stars integer not null check (stars between 1 and 5),
      comment text,
      created_at text not null
    );
    create index if not exists idx_reviews_order on reviews(order_id);

    create table if not exists audit_log (
      id text primary key,
      actor text not null,
      action text not null,
      details text,
      created_at text not null
    );
    create index if not exists idx_audit_created on audit_log(created_at desc);

    create table if not exists bot_sessions (
      telegram_chat_id text primary key,
      state text default '{}',
      updated_at text not null
    );

    create table if not exists invoice_settings (
      id integer primary key check (id = 1),
      company_name text default 'ABC Sdn Bhd',
      ssm_number text default '20260417',
      bank_name text default 'Maybank',
      bank_account text default '12345678910',
      bank_holder text default 'ABC Sdn Bhd',
      logo_url text,
      footer_notes text default 'Thank you for your purchase!',
      sst_enabled integer default 1,
      sst_rate real default 0.08,
      monthly_target real default 15000
    );

    create table if not exists bot_settings (
      id integer primary key check (id = 1),
      welcome_message text default 'Welcome to ABC Sdn Bhd! 🌿',
      pending_message text default 'Your order is being reviewed by our team.',
      confirmed_message text default 'Payment received! Here is your invoice.',
      packed_message text default '📦 Your order has been packed!',
      out_for_delivery_message text default '🚚 Your order is out for delivery!',
      delivered_message text default '✅ Your order has been delivered!'
    );
  `);
}

function seedDefaults(db: Database.Database) {
  db.prepare(`insert or ignore into invoice_settings (id) values (1)`).run();
  db.prepare(`insert or ignore into bot_settings (id) values (1)`).run();

  const count = db.prepare(`select count(*) as n from products`).get() as { n: number };
  if (count.n === 0) {
    const seed = db.prepare(`
      insert into products (id, name, sku, price, cost, stock, is_active, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const now = new Date().toISOString();
    const items: [string, string, number, number, number][] = [
      ["Premium Bird's Nest (6 bottles)", "BN-006", 288.00, 180.00, 50],
      ["Premium Bird's Nest (12 bottles)", "BN-012", 528.00, 340.00, 30],
      ["Collagen Drink — Sakura Rose (15 sachets)", "CL-015", 135.00, 75.00, 80],
      ["Collagen Drink — Sakura Rose (30 sachets)", "CL-030", 248.00, 145.00, 60],
      ["Lingzhi Capsules (60 caps)", "LZ-060", 198.00, 120.00, 40],
      ["Lingzhi Capsules (120 caps)", "LZ-120", 368.00, 220.00, 25],
      ["Cordyceps Energy Tonic (10 bottles)", "CD-010", 168.00, 95.00, 35],
      ["ABC Wellness Bundle", "WB-001", 558.00, 360.00, 20],
    ];
    const tx = db.transaction(() => {
      for (const [name, sku, price, cost, stock] of items) {
        seed.run(crypto.randomUUID(), name, sku, price, cost, stock, now, now);
      }
    });
    tx();
  }
}

// Generate next order reference: ORD-YYYYXXXX
export function nextOrderRef(): string {
  const db = getDb();
  const y = new Date().getFullYear().toString();
  const row = db
    .prepare(
      `select coalesce(max(cast(substr(order_reference, 8) as integer)), 0) + 1 as n
       from orders where order_reference like ?`
    )
    .get(`ORD-${y}%`) as { n: number };
  return `ORD-${y}${String(row.n).padStart(4, "0")}`;
}

// Generate next invoice number: ABC-YYYY-XXXX
export function nextInvoiceNo(): string {
  const db = getDb();
  const y = new Date().getFullYear().toString();
  const row = db
    .prepare(
      `select coalesce(max(cast(substr(invoice_number, 10) as integer)), 0) + 1 as n
       from orders where invoice_number like ?`
    )
    .get(`ABC-${y}-%`) as { n: number };
  return `ABC-${y}-${String(row.n).padStart(4, "0")}`;
}

