import { Check } from "lucide-react";
import { shortMonth, usd } from "@/lib/format";
import type { MonthImpact } from "@/lib/ssi/engine";

/** One month's SSI check, drawn as a perforated stub. A cut shows the old amount struck through. */
export function CheckStub({ m }: { m: MonthImpact }) {
  const cut = m.loss > 0;
  const label =
    `${shortMonth(m.paymentMonth)} SSI check: ${usd(m.payment)}` +
    (cut ? `, down ${usd(m.loss)} from ${usd(m.basePayment)}` : ", unchanged") +
    (m.overResourceLimit ? ". Savings are over the $2,000 limit." : ".");

  return (
    <div
      role="img"
      aria-label={label}
      className={`stub-perforation min-w-0 rounded-md border py-2.5 pl-4 pr-2.5 ${
        cut ? "border-cost/35 bg-cost-soft/60" : "border-rule bg-surface"
      }`}
    >
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        {shortMonth(m.paymentMonth)}
      </div>
      {cut ? (
        <div className="mt-1 truncate text-xs tabular-nums text-ink-3 line-through">{usd(m.basePayment)}</div>
      ) : (
        <div className="mt-1 flex items-center gap-1 text-xs text-safe">
          <Check className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">Unchanged</span>
        </div>
      )}
      <div
        className={`truncate text-base font-semibold tabular-nums sm:text-lg ${cut ? "text-cost" : "text-ink"}`}
      >
        {usd(m.payment)}
      </div>
    </div>
  );
}
