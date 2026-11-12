import type { ExtractedInvoice } from "../invoice/extract";
import { paramsFor, SSI_CONSTANTS, type RuleId } from "./rules";

/**
 * Deterministic SSI rules engine: how a planned gift changes someone's SSI
 * checks, month by month, with the official rule behind each effect.
 * No AI here. All money math is in whole cents.
 *
 * Scope (stated in the UI): an individual (not a couple) living in their own
 * household, with no earned income. Regular unearned income such as a small
 * Social Security check goes in `otherUnearnedIncome`; January/February COLA
 * coordination of Social Security income is not modelled.
 */

export type GiftRoute = "cash_to_recipient" | "vendor_direct" | "able_contribution";
export type ExpenseKind = "shelter" | "non_shelter";

export interface RecipientProfile {
  /** Regular monthly unearned income besides gifts (e.g. Social Security). */
  otherUnearnedIncome: number;
  /** Countable resources (cash, bank balance) on the 1st of each month before any gift. */
  countableResources: number;
  /** Third-party ABLE contributions already made in the calendar year of the earliest ABLE gift. */
  ableContributedThisYear?: number;
}

export interface PlannedGift {
  id: string;
  /** Month the money arrives or the bill is paid, "YYYY-MM". */
  month: string;
  amount: number;
  route: GiftRoute;
  /** What the money pays for. Rent, mortgage, property tax and utilities are shelter. */
  expense: ExpenseKind;
  /** Cash only: received once in the quarter from this source (SI 00810.410). Default true. */
  infrequent?: boolean;
  /** Cash only: dollars still unspent on the 1st of the next month (they stay saved after that). */
  retainedIntoNextMonth?: number;
}

export interface Finding {
  giftId?: string;
  severity: "ok" | "cost" | "warning";
  text: string;
  rules: RuleId[];
}

export interface MonthImpact {
  paymentMonth: string;
  /** Income in this month sets the payment (retrospective monthly accounting). */
  budgetMonth: string;
  fbr: number;
  basePayment: number;
  payment: number;
  loss: number;
  resourcesOnFirst: number;
  overResourceLimit: boolean;
}

export interface Simulation {
  months: MonthImpact[];
  totalLoss: number;
  findings: Finding[];
}

// ---------- months ----------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseMonth(m: string): { y: number; mo: number } {
  const r = MONTH_RE.exec(m);
  if (!r) throw new Error(`Month must look like 2026-11, got "${m}"`);
  return { y: Number(r[1]), mo: Number(r[2]) };
}

export function addMonths(m: string, n: number): string {
  const { y, mo } = parseMonth(m);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

const yearOf = (m: string) => parseMonth(m).y;
const quarterOf = (m: string) => {
  const { y, mo } = parseMonth(m);
  return `${y}-Q${Math.ceil(mo / 3)}`;
};

function monthRange(from: string, to: string): string[] {
  parseMonth(from);
  parseMonth(to);
  if (to < from) throw new Error(`Horizon ends (${to}) before it starts (${from})`);
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function monthLabel(m: string): string {
  const { y, mo } = parseMonth(m);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------- money ----------

const cents = (dollars: number) => Math.round(dollars * 100);
const dollars = (c: number) => c / 100;
const money = (d: number) =>
  `$${d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- categories ----------

type BillCategory = ExtractedInvoice["category"];

/** Food left the in-kind support calculation on 9/30/2024, so only housing costs are shelter. */
export function expenseKindFor(category: BillCategory): ExpenseKind {
  return category === "rent_or_mortgage" || category === "utilities" ? "shelter" : "non_shelter";
}

// ---------- engine ----------

function validate(gifts: PlannedGift[]): void {
  const ids = new Set<string>();
  for (const g of gifts) {
    parseMonth(g.month);
    if (ids.has(g.id)) throw new Error(`Duplicate gift id "${g.id}"`);
    ids.add(g.id);
    if (!(g.amount > 0)) throw new Error(`Gift ${g.id}: amount must be more than $0`);
    const kept = g.retainedIntoNextMonth ?? 0;
    if (kept < 0 || kept > g.amount) throw new Error(`Gift ${g.id}: retained amount must be between $0 and the gift`);
    if (kept > 0 && g.route !== "cash_to_recipient") {
      throw new Error(`Gift ${g.id}: only cash given to the person can be retained`);
    }
  }
}

/** Countable cash per gift after the shared $60-per-quarter infrequent exclusion, in cents. */
function cashAfterInfrequentExclusion(gifts: PlannedGift[]): Map<string, number> {
  const left = new Map<string, number>();
  const out = new Map<string, number>();
  const cash = gifts
    .filter((g) => g.route === "cash_to_recipient")
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  for (const g of cash) {
    let amount = cents(g.amount);
    if (g.infrequent ?? true) {
      const q = quarterOf(g.month);
      const budget = left.get(q) ?? cents(SSI_CONSTANTS.infrequentUnearnedPerQuarter);
      const used = Math.min(budget, amount);
      left.set(q, budget - used);
      amount -= used;
    }
    out.set(g.id, amount);
  }
  return out;
}

function computeMonths(profile: RecipientProfile, gifts: PlannedGift[], months: string[]): MonthImpact[] {
  const cashCountable = cashAfterInfrequentExclusion(gifts);
  const other = cents(profile.otherUnearnedIncome);
  const gie = cents(SSI_CONSTANTS.generalIncomeExclusion);
  const limit = cents(SSI_CONSTANTS.resourceLimitIndividual);
  const baseResources = cents(profile.countableResources);

  return months.map((paymentMonth) => {
    const budgetMonth = addMonths(paymentMonth, -2);
    const params = paramsFor(yearOf(paymentMonth));
    const fbr = cents(params.fbrIndividual);

    // Shelter paid by someone outside the household is ISM, capped at the PMV for the
    // month of payment computation (SI 00835.300 C.2.b).
    const shelter = gifts
      .filter((g) => g.month === budgetMonth && g.route === "vendor_direct" && g.expense === "shelter")
      .reduce((s, g) => s + cents(g.amount), 0);
    const ism = Math.min(shelter, cents(params.pmv));

    const cash = gifts
      .filter((g) => g.month === budgetMonth && g.route === "cash_to_recipient")
      .reduce((s, g) => s + (cashCountable.get(g.id) ?? 0), 0);

    const countable = Math.max(0, other + cash + ism - gie);
    const baseCountable = Math.max(0, other - gie);

    // Cash kept past the month it arrived is a resource on every later first-of-month.
    const kept = gifts
      .filter((g) => g.route === "cash_to_recipient" && g.month < paymentMonth)
      .reduce((s, g) => s + cents(g.retainedIntoNextMonth ?? 0), 0);
    const resources = baseResources + kept;
    const overResourceLimit = resources > limit;

    const basePayment = baseResources > limit ? 0 : Math.max(0, fbr - baseCountable);
    const payment = overResourceLimit ? 0 : Math.max(0, fbr - countable);

    return {
      paymentMonth,
      budgetMonth,
      fbr: dollars(fbr),
      basePayment: dollars(basePayment),
      payment: dollars(payment),
      loss: dollars(basePayment - payment),
      resourcesOnFirst: dollars(resources),
      overResourceLimit,
    };
  });
}

const totalLossOf = (months: MonthImpact[]) =>
  dollars(months.reduce((s, m) => s + cents(m.loss), 0));

function describeGift(g: PlannedGift, loss: number): Finding {
  const affected = monthLabel(addMonths(g.month, 2));
  const received = monthLabel(g.month);

  if (g.route === "vendor_direct" && g.expense === "non_shelter") {
    return {
      giftId: g.id,
      severity: "ok",
      text: "Paid straight to the vendor, so it is not income and SSI stays the same.",
      rules: ["THIRD_PARTY_BILLS"],
    };
  }

  if (g.route === "vendor_direct") {
    return {
      giftId: g.id,
      severity: loss > 0 ? "cost" : "ok",
      text:
        `Rent or utilities paid by someone else count as in-kind support, valued at no more than ` +
        `${money(paramsFor(yearOf(addMonths(g.month, 2))).pmv)}. That lowers the ${affected} check by ${money(loss)}. ` +
        `Paying through an ABLE account avoids this.`,
      rules: ["THIRD_PARTY_BILLS", "ISM_OUTSIDE_HOUSEHOLD", "PMV", "GIE", "RMA"],
    };
  }

  if (g.route === "cash_to_recipient") {
    const infrequent = g.infrequent ?? true;
    const kept = g.retainedIntoNextMonth ?? 0;
    const rules: RuleId[] = ["GIFTS_ARE_INCOME", "GIE", "RMA"];
    if (infrequent) rules.splice(1, 0, "IIE");
    let text =
      `Cash counts as income in ${received}. After the ` +
      `${infrequent ? "$60 once-a-quarter and " : ""}$20 monthly exclusions, ` +
      `it costs ${money(loss)} in SSI, starting with the ${affected} check.`;
    if (kept > 0) {
      rules.push("RESOURCES_FOM", "RESOURCE_LIMIT");
      text += ` The ${money(kept)} still unspent on the 1st of the next month counts as savings; above $2,000, no check is paid that month.`;
    }
    return { giftId: g.id, severity: loss > 0 ? "cost" : "ok", text, rules };
  }

  const shelter = g.expense === "shelter";
  return {
    giftId: g.id,
    severity: shelter ? "warning" : "ok",
    text:
      "Money others put into an ABLE account is not income, and up to $100,000 in the account does not count as savings." +
      (shelter
        ? " Withdraw it and pay the rent in the same month: a housing withdrawal kept past month-end counts as savings."
        : ""),
    rules: ["ABLE"],
  };
}

function ableLimitFindings(profile: RecipientProfile, gifts: PlannedGift[]): Finding[] {
  const able = gifts.filter((g) => g.route === "able_contribution");
  if (able.length === 0) return [];
  const firstYear = Math.min(...able.map((g) => yearOf(g.month)));
  const totals = new Map<number, number>([[firstYear, cents(profile.ableContributedThisYear ?? 0)]]);
  for (const g of able) totals.set(yearOf(g.month), (totals.get(yearOf(g.month)) ?? 0) + cents(g.amount));

  const findings: Finding[] = [];
  for (const [year, total] of totals) {
    const limit = paramsFor(year).ableAnnualLimit;
    if (total > cents(limit)) {
      findings.push({
        severity: "warning",
        text: `ABLE contributions for ${year} would reach ${money(dollars(total))}, over the ${money(limit)} yearly limit. Contributions above the limit are not allowed.`,
        rules: ["ABLE_ANNUAL_LIMIT"],
      });
    }
  }
  return findings;
}

/**
 * Simulate SSI checks with and without the planned gifts.
 * Default horizon: the first gift's month through two months after the last gift,
 * so every gift's effect (income counts two months later) is included.
 */
export function simulate(
  profile: RecipientProfile,
  gifts: PlannedGift[],
  horizon?: { from: string; to: string },
): Simulation {
  validate(gifts);
  if (gifts.length === 0 && !horizon) return { months: [], totalLoss: 0, findings: [] };

  const sorted = gifts.map((g) => g.month).sort();
  const from = horizon?.from ?? sorted[0];
  const to = horizon?.to ?? addMonths(sorted[sorted.length - 1], 2);
  const months = monthRange(from, to);

  const all = computeMonths(profile, gifts, months);
  const findings = gifts.map((g) => describeGift(g, totalLossOf(computeMonths(profile, [g], months))));
  findings.push(...ableLimitFindings(profile, gifts));

  return { months: all, totalLoss: totalLossOf(all), findings };
}
