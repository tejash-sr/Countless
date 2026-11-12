import { CheckCircle2, Plus, Receipt, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Callout, Pill, buttonClass } from "@/components/ui";
import { getCircle, listBills, listMembers, profileOf, type Bill, type BillStatus } from "@/lib/data";
import { CATEGORY_LABEL, currentMonth, shortDate, shortMonth, usd } from "@/lib/format";
import { addMonths, expenseKindFor, simulate, type GiftRoute, type PlannedGift } from "@/lib/ssi/engine";
import { SSI_CONSTANTS } from "@/lib/ssi/rules";

export const metadata: Metadata = { title: "Circle" };

export default function CirclePage(props: PageProps<"/c/[circleId]">) {
  return (
    <Suspense fallback={<CircleSkeleton />}>
      <CircleView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

const ROUTE_LABEL: Record<GiftRoute, string> = {
  vendor_direct: "Paid to vendor",
  able_contribution: "Through ABLE",
  cash_to_recipient: "Cash",
};

const STATUS: Record<BillStatus, { label: string; tone: "neutral" | "action" | "safe" | "cost" }> = {
  awaiting_approval: { label: "Awaiting approval", tone: "action" },
  settling: { label: "Paying", tone: "neutral" },
  paid: { label: "Paid", tone: "safe" },
  failed: { label: "Failed", tone: "cost" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function CircleView({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { circleId } = await params;
  const query = await searchParams;
  const circle = await getCircle(circleId);
  if (!circle) notFound();
  const [members, bills] = await Promise.all([listMembers(circleId), listBills(circleId)]);

  const profile = profileOf(circle);
  const month = currentMonth();
  const nextMonth = addMonths(month, 1);
  const live = bills.filter((b) => b.status !== "failed");
  const asGift = (b: Bill, route: GiftRoute = b.route): PlannedGift => ({
    id: b.id,
    month: b.giftMonth,
    amount: b.total,
    route,
    expense: expenseKindFor(b.category),
  });

  const next = simulate(profile, live.map((b) => asGift(b)), { from: nextMonth, to: nextMonth }).months[0];
  const effect = new Map(
    live.map((b) => {
      const actual = simulate(profile, [asGift(b)]).totalLoss;
      const asCash = simulate(profile, [asGift(b, "cash_to_recipient")]).totalLoss;
      return [b.id, { actual, avoided: Math.max(0, asCash - actual), month: addMonths(b.giftMonth, 2) }];
    }),
  );
  const protectedTotal = [...effect.values()].reduce((s, e) => s + e.avoided, 0);
  const monthlyRoom = members.reduce((s, m) => s + m.monthlyCap, 0);
  const limit = SSI_CONSTANTS.resourceLimitIndividual;
  const savingsPct = Math.min(100, Math.round((circle.countableResources / limit) * 100));
  const justAdded = typeof query.added === "string" ? bills.find((b) => b.id === query.added) : undefined;
  const organizerFirst = circle.organizerName.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {justAdded ? (
        <div role="status" className="mb-6">
          <Callout tone="safe" icon={<CheckCircle2 className="size-4" aria-hidden="true" />}>
            <strong>{justAdded.vendorName} bill added.</strong> Nobody is charged until {organizerFirst} approves
            the payment.
          </Callout>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-3">Circle</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight">{circle.recipientName}</h1>
          <p className="mt-2 text-ink-2">
            Organized by {circle.organizerName} · {members.length} people · Receives SSI
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/c/${circle.id}/ledger`} className={buttonClass.secondary}>
            <Receipt className="size-4" aria-hidden="true" />
            Ledger
          </Link>
          <Link href={`/join/${circle.id}`} className={buttonClass.secondary}>
            <UserPlus className="size-4" aria-hidden="true" />
            Invite someone
          </Link>
          <Link href={`/c/${circle.id}/bills/new`} className={buttonClass.primary}>
            <Plus className="size-4" aria-hidden="true" />
            Add a bill
          </Link>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-1 divide-y divide-rule rounded-xl border border-rule bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <dt className="text-sm text-ink-3">{shortMonth(nextMonth)} SSI check</dt>
          <dd className="mt-1 font-serif text-3xl font-semibold tabular-nums">{usd(next.payment)}</dd>
          <dd className="mt-1 text-sm">
            {next.loss > 0 ? (
              <span className="text-cost">Down {usd(next.loss)}</span>
            ) : (
              <span className="text-safe">Full amount</span>
            )}
          </dd>
        </div>
        <div className="p-5">
          <dt className="text-sm text-ink-3">Savings</dt>
          <dd className="mt-1 font-serif text-3xl font-semibold tabular-nums">{usd(circle.countableResources)}</dd>
          <dd className="mt-2">
            <div
              role="img"
              aria-label={`${usd(circle.countableResources)} saved of the ${usd(limit)} SSI limit`}
              className="h-1.5 overflow-hidden rounded-full bg-sunk"
            >
              <div className="h-full rounded-full bg-ink-2" style={{ width: `${savingsPct}%` }} />
            </div>
            <p className="mt-1.5 text-sm text-ink-3">of the {usd(limit)} SSI limit</p>
          </dd>
        </div>
        <div className="p-5">
          <dt className="text-sm text-ink-3">SSI protected by the circle</dt>
          <dd className="mt-1 font-serif text-3xl font-semibold tabular-nums text-safe">{usd(protectedTotal)}</dd>
          <dd className="mt-1 text-sm text-ink-3">compared with giving the same money as cash</dd>
        </div>
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="bills-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="bills-heading" className="font-serif text-2xl font-semibold">
              Bills
            </h2>
            {bills.length ? <span className="text-sm text-ink-3">{bills.length} total</span> : null}
          </div>

          {bills.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-rule-strong px-6 py-10 text-center">
              <Receipt className="mx-auto size-6 text-ink-3" aria-hidden="true" />
              <p className="mt-3 font-semibold">No bills yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                Add a photo of {circle.recipientFirstName}&apos;s next bill. The circle pays the vendor
                directly, so her SSI stays whole.
              </p>
              <Link href={`/c/${circle.id}/bills/new`} className={`${buttonClass.primary} mt-5`}>
                <Plus className="size-4" aria-hidden="true" />
                Add a bill
              </Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-rule rounded-xl border border-rule bg-surface">
              {bills.map((b) => {
                const e = effect.get(b.id);
                const status = STATUS[b.status];
                return (
                  <li key={b.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                    <div className="min-w-0">
                      <Link
                        href={`/c/${circle.id}/bills/${b.id}`}
                        className="block truncate font-semibold text-ink underline-offset-2 hover:text-action hover:underline"
                      >
                        {b.vendorName}
                      </Link>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {CATEGORY_LABEL[b.category]}
                        {b.invoiceNumber ? ` · Invoice ${b.invoiceNumber}` : ""}
                        {b.dueDate ? ` · Due ${shortDate(b.dueDate)}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Pill tone={status.tone}>{status.label}</Pill>
                        <Pill>{ROUTE_LABEL[b.route]}</Pill>
                        {e && e.actual > 0 ? (
                          <Pill tone="cost">
                            SSI −{usd(e.actual)} in {shortMonth(e.month)}
                          </Pill>
                        ) : (
                          <Pill tone="safe">SSI unchanged</Pill>
                        )}
                      </div>
                    </div>
                    <p className="text-lg font-semibold tabular-nums sm:text-right">{usd(b.total)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside aria-labelledby="circle-heading">
          <h2 id="circle-heading" className="font-serif text-2xl font-semibold">
            The circle
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            Up to {usd(monthlyRoom)} a month between {members.length} people
          </p>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk text-sm font-semibold text-ink-2"
                >
                  {initials(m.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate text-sm text-ink-3">{m.relationship}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{usd(m.monthlyCap)}/mo</p>
                  <p className={`text-xs ${m.vaultTokenId ? "text-safe" : "text-ink-3"}`}>
                    {m.vaultTokenId ? "PayPal saved" : "Invited"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function CircleSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading the circle">
      <div className="h-4 w-16 animate-pulse rounded bg-sunk" />
      <div className="mt-3 h-9 w-64 animate-pulse rounded bg-sunk" />
      <div className="mt-8 h-32 animate-pulse rounded-xl bg-sunk" />
      <div className="mt-10 h-48 animate-pulse rounded-xl bg-sunk" />
    </div>
  );
}
