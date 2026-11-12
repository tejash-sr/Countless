import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { ExtractedInvoice } from "./invoice/extract";
import type { GiftRoute, RecipientProfile } from "./ssi/engine";
import type { Share } from "./split";

export type BillCategory = ExtractedInvoice["category"];
export type BillStatus = "awaiting_approval" | "settling" | "paid" | "failed";

export interface Circle {
  id: string;
  recipientName: string;
  recipientFirstName: string;
  organizerName: string;
  otherUnearnedIncome: number;
  countableResources: number;
  hasAble: boolean;
  ableContributedThisYear: number;
}

export interface Member {
  id: string;
  circleId: string;
  name: string;
  relationship: string;
  monthlyCap: number;
  paypalEmail: string | null;
  vaultTokenId: string | null;
  joinedAt: string | null;
}

export interface ExtractionMeta {
  model: string;
  confidence: number;
  ms: number;
  reasons: string[];
  source: "photo" | "text";
}

export interface Bill {
  id: string;
  circleId: string;
  vendorName: string;
  vendorPayPalEmail: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  category: BillCategory;
  total: number;
  lineItems: { description: string; amount: number }[];
  extraction: ExtractionMeta | null;
  route: GiftRoute;
  giftMonth: string;
  shares: Share[];
  status: BillStatus;
  settlement: Settlement | null;
  createdAt: string;
}

/** What actually moved through PayPal when a bill was paid. */
export interface Settlement {
  approvedBy: string;
  approvedAt: string;
  charges: { memberId: string; amount: number; orderId?: string; status: string; error?: string }[];
  payout?: { batchId?: string; amount: number; to: string; status: string; error?: string };
  /** Filled in when the read-only agent checks the run against PayPal (src/lib/agent/verify.ts). */
  review?: {
    verdict: "verified" | "needs_attention";
    summary: string;
    toolCalls: { tool: string; target: string }[];
    model: string;
    checkedAt: string;
    ms: number;
  };
}

const dollars = (cents: unknown) => Number(cents) / 100;
const cents = (d: number) => Math.round(d * 100);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

type Row = Record<string, unknown>;

function toCircle(r: Row): Circle {
  return {
    id: String(r.id),
    recipientName: String(r.recipient_name),
    recipientFirstName: String(r.recipient_first_name),
    organizerName: String(r.organizer_name),
    otherUnearnedIncome: dollars(r.other_unearned_income_cents),
    countableResources: dollars(r.countable_resources_cents),
    hasAble: Boolean(r.has_able),
    ableContributedThisYear: dollars(r.able_contributed_this_year_cents),
  };
}

function toMember(r: Row): Member {
  return {
    id: String(r.id),
    circleId: String(r.circle_id),
    name: String(r.name),
    relationship: String(r.relationship),
    monthlyCap: dollars(r.monthly_cap_cents),
    paypalEmail: (r.paypal_email as string | null) ?? null,
    vaultTokenId: (r.vault_token_id as string | null) ?? null,
    joinedAt: iso(r.joined_at),
  };
}

function toBill(r: Row): Bill {
  return {
    id: String(r.id),
    circleId: String(r.circle_id),
    vendorName: String(r.vendor_name),
    vendorPayPalEmail: (r.vendor_paypal_email as string | null) ?? null,
    invoiceNumber: (r.invoice_number as string | null) ?? null,
    invoiceDate: (r.invoice_date as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    category: r.category as BillCategory,
    total: dollars(r.total_cents),
    lineItems: (r.line_items as Bill["lineItems"]) ?? [],
    extraction: (r.extraction as ExtractionMeta | null) ?? null,
    route: r.route as GiftRoute,
    giftMonth: String(r.gift_month),
    shares: (r.shares as Share[]) ?? [],
    status: r.status as BillStatus,
    settlement: (r.settlement as Settlement | null) ?? null,
    createdAt: iso(r.created_at) ?? "",
  };
}

export async function getCircle(id: string): Promise<Circle | null> {
  const db = await getDb();
  const rows = await db.query("select * from circles where id = $1", [id]);
  return rows[0] ? toCircle(rows[0]) : null;
}

export async function listMembers(circleId: string): Promise<Member[]> {
  const db = await getDb();
  const rows = await db.query("select * from members where circle_id = $1 order by created_at, id", [circleId]);
  return rows.map(toMember);
}

export async function listBills(circleId: string): Promise<Bill[]> {
  const db = await getDb();
  const rows = await db.query("select * from bills where circle_id = $1 order by created_at desc", [circleId]);
  return rows.map(toBill);
}

export interface NewBill {
  circleId: string;
  vendorName: string;
  vendorPayPalEmail: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  category: BillCategory;
  total: number;
  lineItems: Bill["lineItems"];
  extraction: ExtractionMeta | null;
  route: GiftRoute;
  giftMonth: string;
  shares: Share[];
}

export async function createBill(b: NewBill): Promise<string> {
  const db = await getDb();
  const id = randomUUID().slice(0, 8);
  await db.query(
    `insert into bills (id, circle_id, vendor_name, vendor_paypal_email, invoice_number, invoice_date,
       due_date, category, total_cents, line_items, extraction, route, gift_month, shares)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb)`,
    [
      id,
      b.circleId,
      b.vendorName,
      b.vendorPayPalEmail,
      b.invoiceNumber,
      b.invoiceDate,
      b.dueDate,
      b.category,
      cents(b.total),
      JSON.stringify(b.lineItems),
      b.extraction ? JSON.stringify(b.extraction) : null,
      b.route,
      b.giftMonth,
      JSON.stringify(b.shares),
    ],
  );
  return id;
}

export async function getBill(circleId: string, billId: string): Promise<Bill | null> {
  const db = await getDb();
  const rows = await db.query("select * from bills where circle_id = $1 and id = $2", [circleId, billId]);
  return rows[0] ? toBill(rows[0]) : null;
}

export async function setBillStatus(id: string, status: BillStatus, settlement?: Settlement): Promise<void> {
  const db = await getDb();
  await db.query("update bills set status = $2, settlement = coalesce($3::jsonb, settlement) where id = $1", [
    id,
    status,
    settlement ? JSON.stringify(settlement) : null,
  ]);
}

/** Claim a bill for settlement exactly once (guards against double clicks and replays). */
export async function claimBillForSettlement(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.query("update bills set status = 'settling' where id = $1 and status = 'awaiting_approval' returning id", [id]);
  return rows.length === 1;
}

export async function getMember(circleId: string, memberId: string): Promise<Member | null> {
  const db = await getDb();
  const rows = await db.query("select * from members where circle_id = $1 and id = $2", [circleId, memberId]);
  return rows[0] ? toMember(rows[0]) : null;
}

export async function addMember(m: { circleId: string; name: string; relationship: string; monthlyCap: number }): Promise<string> {
  const db = await getDb();
  const id = randomUUID().slice(0, 8);
  await db.query(
    "insert into members (id, circle_id, name, relationship, monthly_cap_cents) values ($1,$2,$3,$4,$5)",
    [id, m.circleId, m.name, m.relationship, cents(m.monthlyCap)],
  );
  return id;
}

export async function updateMemberPledge(memberId: string, monthlyCap: number, setupTokenId: string): Promise<void> {
  const db = await getDb();
  await db.query("update members set monthly_cap_cents = $2, setup_token_id = $3 where id = $1", [
    memberId,
    cents(monthlyCap),
    setupTokenId,
  ]);
}

export async function getSetupTokenId(memberId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.query<{ setup_token_id: string | null }>("select setup_token_id from members where id = $1", [memberId]);
  return rows[0]?.setup_token_id ?? null;
}

export async function saveMemberVault(memberId: string, vaultTokenId: string, paypalEmail: string | null): Promise<void> {
  const db = await getDb();
  await db.query(
    "update members set vault_token_id = $2, paypal_email = $3, joined_at = now(), setup_token_id = null where id = $1",
    [memberId, vaultTokenId, paypalEmail],
  );
}

export function profileOf(c: Circle): RecipientProfile {
  return {
    otherUnearnedIncome: c.otherUnearnedIncome,
    countableResources: c.countableResources,
    ableContributedThisYear: c.ableContributedThisYear,
  };
}
