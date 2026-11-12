import { describe, expect, it } from "vitest";
import { addMonths, expenseKindFor, simulate, type PlannedGift, type RecipientProfile } from "./engine";
import { paramsFor } from "./rules";

// Hand-worked examples. Figures: SSA OACT (FBR $994 in 2026, $1,029 in 2027) and POMS.
const rosa: RecipientProfile = { otherUnearnedIncome: 0, countableResources: 400 };

const gift = (g: Partial<PlannedGift>): PlannedGift => ({
  id: "g1",
  month: "2026-11",
  amount: 501.73,
  route: "cash_to_recipient",
  expense: "non_shelter",
  ...g,
});

const payment = (sim: ReturnType<typeof simulate>, month: string) =>
  sim.months.find((m) => m.paymentMonth === month)!;

describe("rules", () => {
  it("has SSA's published 2026 and 2027 rates, and VTR/PMV follow the one-third formula", () => {
    expect(paramsFor(2026)).toMatchObject({ fbrIndividual: 994, vtr: 331.33, pmv: 351.33 });
    expect(paramsFor(2027)).toMatchObject({ fbrIndividual: 1029, vtr: 343, pmv: 363 });
    for (const year of [2026, 2027]) {
      const p = paramsFor(year);
      expect(p.vtr).toBe(Math.round((p.fbrIndividual * 100) / 3) / 100);
      expect(p.pmv).toBe(Math.round((p.vtr + 20) * 100) / 100);
    }
  });

  it("refuses to guess for a year it has no published figures for", () => {
    expect(() => paramsFor(2029)).toThrow(/2029/);
  });
});

describe("month helpers and categories", () => {
  it("adds months across a year boundary", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("treats rent, mortgage and utilities as shelter, and food as not (food left ISM on 9/30/2024)", () => {
    expect(expenseKindFor("rent_or_mortgage")).toBe("shelter");
    expect(expenseKindFor("utilities")).toBe("shelter");
    expect(expenseKindFor("food")).toBe("non_shelter");
    expect(expenseKindFor("vehicle_repair")).toBe("non_shelter");
  });
});

describe("simulate: the car repair (the demo story)", () => {
  it("paying the repair shop directly costs Rosa nothing", () => {
    const sim = simulate(rosa, [gift({ route: "vendor_direct" })]);
    expect(sim.totalLoss).toBe(0);
    expect(payment(sim, "2027-01").payment).toBe(1029);
    expect(sim.findings[0].rules).toContain("THIRD_PARTY_BILLS");
    expect(sim.findings[0].severity).toBe("ok");
  });

  it("the same money as cash cuts the January 2027 check two months later", () => {
    // $501.73 - $60 infrequent exclusion - $20 general exclusion = $421.73 countable in Nov 2026
    const sim = simulate(rosa, [gift({})]);
    expect(payment(sim, "2026-11").loss).toBe(0);
    expect(payment(sim, "2026-12").loss).toBe(0);
    expect(payment(sim, "2027-01").payment).toBe(607.27);
    expect(sim.totalLoss).toBe(421.73);
    expect(sim.findings[0].rules).toEqual(
      expect.arrayContaining(["GIFTS_ARE_INCOME", "IIE", "GIE", "RMA"]),
    );
  });

  it("a regular (not infrequent) $500 cash gift costs $480", () => {
    const sim = simulate(rosa, [gift({ amount: 500, infrequent: false })]);
    expect(sim.totalLoss).toBe(480);
  });

  it("a big enough cash gift wipes out the whole check", () => {
    const sim = simulate(rosa, [gift({ amount: 1200 })]);
    expect(payment(sim, "2027-01").payment).toBe(0);
    expect(sim.totalLoss).toBe(1029);
  });

  it("cash kept past month-end pushes Rosa over $2,000 and stops every check while it is kept", () => {
    // Dec 1: $400 + $2,000 kept = $2,400 > $2,000, so Dec, Jan and Feb pay $0.
    const sim = simulate(rosa, [gift({ amount: 3000, retainedIntoNextMonth: 2000 })], {
      from: "2026-11",
      to: "2027-02",
    });
    expect(payment(sim, "2026-11").payment).toBe(994);
    expect(payment(sim, "2026-12")).toMatchObject({ payment: 0, overResourceLimit: true });
    expect(payment(sim, "2027-01").payment).toBe(0);
    expect(payment(sim, "2027-02").payment).toBe(0);
    expect(sim.totalLoss).toBe(994 + 1029 + 1029);
    expect(sim.findings[0].rules).toContain("RESOURCES_FOM");
  });
});

describe("simulate: rent (shelter) and ABLE", () => {
  it("rent paid by a donor in Oct 2026 lowers the Dec check to $662.67 (matches SSA's own example)", () => {
    const sim = simulate(rosa, [gift({ month: "2026-10", amount: 800, route: "vendor_direct", expense: "shelter" })]);
    expect(payment(sim, "2026-12").payment).toBe(662.67);
    expect(sim.totalLoss).toBe(331.33);
    expect(sim.findings[0].rules).toEqual(expect.arrayContaining(["ISM_OUTSIDE_HOUSEHOLD", "PMV"]));
  });

  it("rent paid in Nov 2026 is capped with the 2027 PMV, because PMV follows the payment month", () => {
    // SI 00835.300 C.2.b: PMV = 1/3 of the FBR in effect for the month of payment computation, + $20.
    const sim = simulate(rosa, [gift({ amount: 800, route: "vendor_direct", expense: "shelter" })]);
    expect(payment(sim, "2027-01").payment).toBe(1029 - (363 - 20));
    expect(sim.totalLoss).toBe(343);
  });

  it("rent below the cap counts at its real value", () => {
    const sim = simulate(rosa, [gift({ amount: 250, route: "vendor_direct", expense: "shelter" })]);
    expect(sim.totalLoss).toBe(230);
  });

  it("when Social Security already used the $20 exclusion, rent help counts in full", () => {
    const withSsdi: RecipientProfile = { otherUnearnedIncome: 300, countableResources: 400 };
    const sim = simulate(withSsdi, [gift({ month: "2026-10", amount: 800, route: "vendor_direct", expense: "shelter" })]);
    expect(payment(sim, "2026-12").basePayment).toBe(714); // 994 - (300 - 20)
    expect(payment(sim, "2026-12").payment).toBe(362.67); // 994 - (300 + 351.33 - 20)
    expect(sim.totalLoss).toBe(351.33);
  });

  it("rent routed through an ABLE account costs nothing, with a same-month spending warning", () => {
    const sim = simulate(rosa, [gift({ amount: 800, route: "able_contribution", expense: "shelter" })]);
    expect(sim.totalLoss).toBe(0);
    const f = sim.findings[0];
    expect(f.rules).toContain("ABLE");
    expect(f.severity).toBe("warning");
    expect(f.text).toMatch(/same month/i);
  });

  it("warns when ABLE contributions pass the year's limit", () => {
    const sim = simulate({ ...rosa, ableContributedThisYear: 18_800 }, [
      gift({ amount: 500, route: "able_contribution", expense: "non_shelter" }),
    ]);
    expect(sim.findings.some((f) => f.severity === "warning" && /19,000/.test(f.text))).toBe(true);
  });
});

describe("simulate: exclusions are shared, not per gift", () => {
  it("the $60 infrequent exclusion is one budget per calendar quarter", () => {
    // Oct: $50 fully excluded ($10 of the quarter's $60 left). Nov: $50 - $10 - $20 = $20 countable.
    const sim = simulate(rosa, [
      gift({ id: "a", month: "2026-10", amount: 50 }),
      gift({ id: "b", month: "2026-11", amount: 50 }),
    ]);
    expect(payment(sim, "2026-12").loss).toBe(0);
    expect(payment(sim, "2027-01").loss).toBe(20);
    expect(sim.totalLoss).toBe(20);
  });
});
