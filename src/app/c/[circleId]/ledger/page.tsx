import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCircle, listBills, listMembers } from "@/lib/data";
import { usd } from "@/lib/format";
import { LedgerGrid, type LedgerRow } from "./ledger-grid";

export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage(props: PageProps<"/c/[circleId]/ledger">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 text-ink-3">Loading the ledger…</div>}>
      <LedgerView params={props.params} />
    </Suspense>
  );
}

async function LedgerView({ params }: { params: Promise<{ circleId: string }> }) {
  await connection();
  const { circleId } = await params;
  const circle = await getCircle(circleId);
  if (!circle) notFound();
  const [members, bills] = await Promise.all([listMembers(circleId), listBills(circleId)]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;

  const rows: LedgerRow[] = [];
  for (const b of bills) {
    const s = b.settlement;
    if (!s) continue;
    const bill = `${b.vendorName}${b.invoiceNumber ? ` #${b.invoiceNumber}` : ""}`;
    const verified = s.review ? (s.review.verdict === "verified" ? "Verified" : "Needs attention") : "Not checked";
    for (const c of s.charges) {
      rows.push({
        date: s.approvedAt,
        bill,
        billHref: `/c/${circle.id}/bills/${b.id}`,
        movement: "Charge",
        party: name(c.memberId),
        reference: c.orderId ?? "—",
        amount: c.status === "FAILED" ? 0 : c.amount,
        status: c.status,
        agent: verified,
      });
    }
    if (s.payout) {
      rows.push({
        date: s.approvedAt,
        bill,
        billHref: `/c/${circle.id}/bills/${b.id}`,
        movement: "Payout",
        party: s.payout.to,
        reference: s.payout.batchId ?? "—",
        amount: s.payout.status === "FAILED" ? 0 : -s.payout.amount,
        status: s.payout.status,
        agent: verified,
      });
    }
  }

  const cents = (n: number) => Math.round(n * 100);
  const inCents = rows.filter((r) => r.amount > 0).reduce((t, r) => t + cents(r.amount), 0);
  const outCents = rows.filter((r) => r.amount < 0).reduce((t, r) => t - cents(r.amount), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <Link href={`/c/${circle.id}`} className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {circle.recipientFirstName}&apos;s circle
      </Link>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Ledger</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Every dollar that moved through PayPal for {circle.recipientFirstName}. Money in from the circle and money out to
        vendors should always net to zero: Countless keeps nothing, and {circle.recipientFirstName} never receives cash.
      </p>

      <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
        <div className="bg-surface p-4">
          <dt className="text-sm text-ink-3">In from the circle</dt>
          <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{usd(inCents / 100)}</dd>
        </div>
        <div className="bg-surface p-4">
          <dt className="text-sm text-ink-3">Out to vendors</dt>
          <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{usd(outCents / 100)}</dd>
        </div>
        <div className="bg-surface p-4">
          <dt className="text-sm text-ink-3">Held by Countless</dt>
          <dd className={`mt-1 font-serif text-2xl font-semibold tabular-nums ${inCents === outCents ? "text-safe" : "text-cost"}`}>
            {usd((inCents - outCents) / 100)}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        {rows.length ? (
          <LedgerGrid rows={rows} />
        ) : (
          <p className="rounded-xl border border-dashed border-rule-strong bg-surface p-6 text-ink-2">
            Nothing has moved yet. When a bill is approved, each charge and the vendor payout appear here.
          </p>
        )}
      </div>
    </div>
  );
}
