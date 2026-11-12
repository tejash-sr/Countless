import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckStub } from "@/components/check-stub";
import { RuleTag } from "@/components/rule-tag";
import { Callout, Pill } from "@/components/ui";
import { getBill, getCircle, listMembers, profileOf, type BillStatus } from "@/lib/data";
import { CATEGORY_LABEL, shortDate, usd } from "@/lib/format";
import { addMonths, expenseKindFor, simulate } from "@/lib/ssi/engine";
import { ApproveButton } from "./approve-button";
import { CheckButton } from "./check-button";

export const metadata: Metadata = { title: "Bill" };

const STATUS: Record<BillStatus, { label: string; tone: "action" | "neutral" | "safe" | "cost" }> = {
  awaiting_approval: { label: "Awaiting approval", tone: "action" },
  settling: { label: "Paying", tone: "neutral" },
  paid: { label: "Paid", tone: "safe" },
  failed: { label: "Needs attention", tone: "cost" },
};

export default function BillPage(props: PageProps<"/c/[circleId]/bills/[billId]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-sunk" aria-busy="true" />}>
        <BillView params={props.params} />
      </Suspense>
    </div>
  );
}

async function BillView({ params }: { params: Promise<{ circleId: string; billId: string }> }) {
  await connection();
  const { circleId, billId } = await params;
  const circle = await getCircle(circleId);
  const bill = circle ? await getBill(circleId, billId) : null;
  if (!circle || !bill) notFound();
  const members = await listMembers(circleId);
  const byId = new Map(members.map((m) => [m.id, m]));

  const first = circle.recipientFirstName;
  const horizon = { from: bill.giftMonth, to: addMonths(bill.giftMonth, 2) };
  const gift = { id: bill.id, month: bill.giftMonth, amount: bill.total, expense: expenseKindFor(bill.category) };
  const chosen = simulate(profileOf(circle), [{ ...gift, route: bill.route }], horizon);
  const asCash = simulate(profileOf(circle), [{ ...gift, route: "cash_to_recipient" }], horizon);
  const unsaved = bill.shares.map((s) => byId.get(s.memberId)).filter((m) => m && !m.vaultTokenId);
  const status = STATUS[bill.status];
  const payTo = bill.route === "able_contribution" ? `${first}'s ABLE account (simulated)` : bill.vendorName;
  const s = bill.settlement;

  return (
    <>
      <Link href={`/c/${circle.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-action hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {first}&apos;s circle
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{bill.vendorName}</h1>
          <p className="mt-2 text-ink-2">
            {CATEGORY_LABEL[bill.category]}
            {bill.invoiceNumber ? ` · Invoice ${bill.invoiceNumber}` : ""}
            {bill.dueDate ? ` · Due ${shortDate(bill.dueDate)}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-3xl font-semibold tabular-nums">{usd(bill.total)}</p>
          <div className="mt-1">
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
        </div>
      </div>

      <section aria-labelledby="ssi-heading" className="mt-10">
        <h2 id="ssi-heading" className="font-serif text-xl font-semibold">
          {first}&apos;s SSI
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {chosen.months.map((m) => (
            <CheckStub key={m.paymentMonth} m={m} />
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-2">
          {chosen.totalLoss === 0
            ? `Paid this way, ${first}'s checks stay whole. As cash, the same money would cost her ${usd(asCash.totalLoss)}.`
            : `Paid this way, ${first} loses ${usd(chosen.totalLoss)}; as cash she would lose ${usd(asCash.totalLoss)}.`}{" "}
          <span className="inline-flex flex-wrap gap-1 align-middle">
            {chosen.findings[0]?.rules.map((r) => <RuleTag key={r} id={r} />)}
          </span>
        </p>
      </section>

      <section aria-labelledby="plan-heading" className="mt-10">
        <h2 id="plan-heading" className="font-serif text-xl font-semibold">
          {s ? "What moved" : "Payment plan"}
        </h2>

        <ol className="mt-4 space-y-6">
          <li>
            <p className="font-semibold">
              <span className="text-ink-3">1.</span> Charge each share to the saved PayPal
            </p>
            <ul className="mt-2 divide-y divide-rule rounded-xl border border-rule bg-surface">
              {bill.shares.map((share) => {
                const m = byId.get(share.memberId);
                const charge = s?.charges.find((c) => c.memberId === share.memberId);
                return (
                  <li key={share.memberId} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m?.name ?? "Former member"}</span>
                      <span className="block truncate text-sm text-ink-3">
                        {charge
                          ? charge.orderId
                            ? `PayPal order ${charge.orderId}`
                            : charge.error ?? "Not charged"
                          : m?.vaultTokenId
                            ? `PayPal saved${m.paypalEmail ? ` · ${m.paypalEmail}` : ""}`
                            : "Hasn't saved PayPal yet"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {charge ? (
                        <Pill tone={charge.status === "FAILED" ? "cost" : "safe"}>
                          {charge.status === "FAILED" ? "Failed" : "Charged"}
                        </Pill>
                      ) : null}
                      <span className="font-semibold tabular-nums">{usd(share.amount)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
          <li>
            <p className="font-semibold">
              <span className="text-ink-3">2.</span> Pay {payTo} in the same run
            </p>
            <div className="mt-2 flex items-center justify-between gap-4 rounded-xl border border-rule bg-surface px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {bill.route === "able_contribution" ? "ABLE deposit" : "PayPal Payouts"}
                </span>
                <span className="block truncate text-sm text-ink-3">
                  {s?.payout?.batchId
                    ? `Payout batch ${s.payout.batchId}`
                    : s?.payout?.error ?? (bill.vendorPayPalEmail ?? "ABLE accounts don't take PayPal")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {s?.payout ? (
                  <Pill tone={s.payout.status === "FAILED" ? "cost" : "safe"}>
                    {s.payout.status === "FAILED" ? "Failed" : s.payout.status === "SIMULATED" ? "Simulated" : "Sent"}
                  </Pill>
                ) : null}
                <span className="font-semibold tabular-nums">{usd(s?.payout?.amount ?? bill.total)}</span>
              </span>
            </div>
          </li>
        </ol>

        {bill.status === "awaiting_approval" ? (
          <div className="mt-8 space-y-4 border-t border-rule pt-6">
            {unsaved.length ? (
              <Callout tone="warn">
                {unsaved.map((m) => m!.name).join(", ")} {unsaved.length === 1 ? "hasn't" : "haven't"} saved PayPal yet.
                Send them the{" "}
                <Link href={`/join/${circle.id}`} className="font-semibold underline">
                  invite link
                </Link>{" "}
                before approving.
              </Callout>
            ) : null}
            <p className="max-w-2xl text-sm text-ink-2">
              Money goes from each saved PayPal to Countless, then straight to {payTo}. Countless keeps nothing:
              its balance is back to $0 when the run ends.
            </p>
            <ApproveButton
              circleId={circle.id}
              billId={bill.id}
              label={`Approve and pay ${usd(bill.total)}`}
              disabled={unsaved.length > 0}
            />
          </div>
        ) : s ? (
          <div className="mt-6">
            <Callout
              tone={bill.status === "paid" ? "safe" : "cost"}
              icon={bill.status === "paid" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : undefined}
            >
              {bill.status === "paid"
                ? `Approved by ${s.approvedBy}. ${bill.vendorName} has been paid and ${first} never received cash.`
                : `Approved by ${s.approvedBy}, but some payments failed. Nothing is retried automatically.`}
            </Callout>
            <div className="mt-8 border-t border-rule pt-6">
              <h3 className="font-serif text-lg font-semibold">Agent check</h3>
              <p className="mt-1 max-w-2xl text-sm text-ink-2">
                A read-only AI agent looks every charge and the payout up in PayPal itself, using the PayPal Agent
                Toolkit. It has no tool that can move money.
              </p>
              {s.review ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={s.review.verdict === "verified" ? "safe" : "warn"}>
                      {s.review.verdict === "verified" ? "Verified with PayPal" : "Needs attention"}
                    </Pill>
                    <span className="text-xs text-ink-3">
                      {s.review.model} · {s.review.toolCalls.length} PayPal lookups · {(s.review.ms / 1000).toFixed(1)} s
                    </span>
                  </div>
                  <p className="max-w-2xl whitespace-pre-line rounded-lg border border-rule bg-surface p-4 text-[15px] leading-relaxed">
                    {s.review.summary}
                  </p>
                  <ul className="flex flex-wrap gap-2" aria-label="PayPal lookups the agent made">
                    {s.review.toolCalls.map((c, i) => (
                      <li key={i} className="rounded border border-rule bg-sunk px-2 py-1 font-mono text-xs text-ink-2">
                        {c.tool}({c.target})
                      </li>
                    ))}
                  </ul>
                  <CheckButton circleId={circle.id} billId={bill.id} again />
                </div>
              ) : (
                <div className="mt-4">
                  <CheckButton circleId={circle.id} billId={bill.id} />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
