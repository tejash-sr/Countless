"use client";

import { CheckStub } from "@/components/check-stub";
import { RuleTag } from "@/components/rule-tag";
import { Pill } from "@/components/ui";
import { usd } from "@/lib/format";
import {
  addMonths,
  simulate,
  type ExpenseKind,
  type GiftRoute,
  type RecipientProfile,
  type Simulation,
} from "@/lib/ssi/engine";

export interface RouteOption {
  route: GiftRoute;
  title: string;
  detail: string;
  /** Countless never hands out cash; that row is shown only for comparison. */
  selectable: boolean;
  sim: Simulation;
}

export function buildRouteOptions(args: {
  profile: RecipientProfile;
  giftMonth: string;
  amount: number;
  expense: ExpenseKind;
  hasAble: boolean;
  vendorName: string;
  firstName: string;
}): RouteOption[] {
  const { profile, giftMonth, amount, expense, hasAble, vendorName, firstName } = args;
  const horizon = { from: giftMonth, to: addMonths(giftMonth, 2) };
  const run = (route: GiftRoute) =>
    simulate(profile, [{ id: route, month: giftMonth, amount, route, expense }], horizon);

  const options: RouteOption[] = [
    {
      route: "vendor_direct",
      title: `Countless pays ${vendorName || "the vendor"} directly`,
      detail: `The circle's shares go to the vendor. ${firstName} never receives cash.`,
      selectable: true,
      sim: run("vendor_direct"),
    },
  ];
  if (hasAble) {
    options.push({
      route: "able_contribution",
      title: `Into ${firstName}'s ABLE account`,
      detail: `${firstName} pays the bill from it in the same month. ABLE accounts don't take PayPal, so this step is simulated in the sandbox.`,
      selectable: true,
      sim: run("able_contribution"),
    });
  }
  options.push({
    route: "cash_to_recipient",
    title: `Cash to ${firstName}`,
    detail: "What a fundraiser or a bank transfer does. Shown for comparison only.",
    selectable: false,
    sim: run("cash_to_recipient"),
  });
  return options;
}

/** Lowest SSI cost among routes Countless can actually use; ties keep the simpler route. */
export function recommendedRoute(options: RouteOption[]): GiftRoute {
  return options
    .filter((o) => o.selectable)
    .reduce((best, o) => (o.sim.totalLoss < best.sim.totalLoss ? o : best)).route;
}

export function RouteMeter({
  options,
  value,
  onChange,
  firstName,
}: {
  options: RouteOption[];
  value: GiftRoute;
  onChange: (route: GiftRoute) => void;
  firstName: string;
}) {
  const recommended = recommendedRoute(options);

  return (
    <fieldset>
      <legend className="sr-only">How should this bill be paid?</legend>
      <div className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
        {options.map((o) => {
          const selected = o.selectable && o.route === value;
          const lost = o.sim.totalLoss > 0;
          return (
            <div
              key={o.route}
              className={`p-4 sm:p-5 ${selected ? "bg-action-soft/50 shadow-[inset_3px_0_0_var(--color-action)]" : ""} ${
                o.selectable ? "" : "bg-sunk/50"
              }`}
            >
              <label className={`flex items-start gap-3 ${o.selectable ? "cursor-pointer" : ""}`}>
                {o.selectable ? (
                  <input
                    type="radio"
                    name="route"
                    value={o.route}
                    checked={selected}
                    onChange={() => onChange(o.route)}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-action)]"
                  />
                ) : (
                  <span className="mt-1 size-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {o.title}
                      {o.route === recommended ? <Pill tone="safe">Recommended</Pill> : null}
                      {!o.selectable ? <Pill>For comparison</Pill> : null}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${lost ? "text-cost" : "text-safe"}`}>
                      {firstName} loses {usd(o.sim.totalLoss)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-2">{o.detail}</span>
                </span>
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2 pl-7">
                {o.sim.months.map((m) => (
                  <CheckStub key={m.paymentMonth} m={m} />
                ))}
              </div>

              <ul className="mt-3 space-y-2 pl-7">
                {o.sim.findings.map((f, i) => (
                  <li key={i} className="text-sm leading-relaxed text-ink-2">
                    {f.text}{" "}
                    <span className="inline-flex flex-wrap gap-1 align-middle">
                      {f.rules.map((r) => (
                        <RuleTag key={r} id={r} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
