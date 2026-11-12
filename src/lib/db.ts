/**
 * Postgres access. Production (Render) uses DATABASE_URL with node-postgres;
 * local development uses PGlite (Postgres compiled to WASM) in .data/pglite,
 * so the same SQL runs everywhere with nothing to install.
 */

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

const SCHEMA = [
  `create table if not exists circles (
     id text primary key,
     recipient_name text not null,
     recipient_first_name text not null,
     organizer_name text not null,
     other_unearned_income_cents integer not null default 0,
     countable_resources_cents integer not null default 0,
     has_able boolean not null default false,
     able_contributed_this_year_cents integer not null default 0,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists members (
     id text primary key,
     circle_id text not null references circles(id) on delete cascade,
     name text not null,
     relationship text not null,
     monthly_cap_cents integer not null,
     paypal_email text,
     vault_token_id text,
     joined_at timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists bills (
     id text primary key,
     circle_id text not null references circles(id) on delete cascade,
     vendor_name text not null,
     vendor_paypal_email text,
     invoice_number text,
     invoice_date text,
     due_date text,
     category text not null,
     total_cents integer not null,
     line_items jsonb not null default '[]',
     extraction jsonb,
     route text not null,
     gift_month text not null,
     shares jsonb not null default '[]',
     status text not null default 'awaiting_approval',
     created_at timestamptz not null default now()
   )`,
  `alter table members add column if not exists setup_token_id text`,
  `alter table bills add column if not exists settlement jsonb`,
];

/** Synthetic demo circle so a fresh deploy (and the judges) land on something real. */
async function seedDemo(db: Db): Promise<void> {
  const existing = await db.query<{ n: number }>("select count(*)::int as n from circles");
  if (existing[0]?.n > 0) return;
  await db.query(
    `insert into circles (id, recipient_name, recipient_first_name, organizer_name,
       other_unearned_income_cents, countable_resources_cents, has_able)
     values ('rosa', 'Rosa Martínez', 'Rosa', 'Ana Martínez', 0, 40000, true)`,
  );
  const members: [string, string, string, number][] = [
    ["ana", "Ana Martínez", "Niece · organizer", 20000],
    ["luis", "Luis Ortega", "Brother", 15000],
    ["carmen", "Carmen Díaz", "Friend from church", 10000],
    ["daniel", "Daniel Okafor", "Neighbor", 10000],
  ];
  for (const [id, name, relationship, cap] of members) {
    await db.query(
      `insert into members (id, circle_id, name, relationship, monthly_cap_cents) values ($1, 'rosa', $2, $3, $4)`,
      [id, name, relationship, cap],
    );
  }
}

async function open(): Promise<Db> {
  let db: Db;
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    db = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    mkdirSync(dir, { recursive: true }); // PGlite creates only the last folder
    const lite = new PGlite(dir);
    db = { query: async (sql, params) => (await lite.query(sql, params)).rows as never[] };
  }
  for (const statement of SCHEMA) await db.query(statement);
  await seedDemo(db);
  return db;
}

// Survive dev hot reloads: one connection (and one PGlite instance) per process.
const g = globalThis as { __countlessDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__countlessDb ??= open().catch((err) => {
    g.__countlessDb = undefined;
    throw err;
  });
  return g.__countlessDb;
}
