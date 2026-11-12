import { describe, expect, it } from "vitest";
import { splitBill } from "./split";

const circle = [
  { id: "ana", monthlyCap: 200 },
  { id: "luis", monthlyCap: 150 },
  { id: "carmen", monthlyCap: 100 },
  { id: "okafor", monthlyCap: 100 },
];

const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount * 100, 0)) / 100;

describe("splitBill", () => {
  it("splits in proportion to monthly limits and adds up to the cent", () => {
    const r = splitBill(501.73, circle);
    expect(r.covered).toBe(501.73);
    expect(r.uncovered).toBe(0);
    expect(sum(r.shares)).toBe(501.73);
    // 501.73 x 200/550 = 182.447... and 150/550 = 136.835...; the 2 leftover cents go to the largest remainders
    expect(r.shares).toEqual([
      { memberId: "ana", amount: 182.45 },
      { memberId: "luis", amount: 136.84 },
      { memberId: "carmen", amount: 91.22 },
      { memberId: "okafor", amount: 91.22 },
    ]);
  });

  it("never charges anyone more than their limit, and reports what is left", () => {
    const r = splitBill(800, circle);
    expect(r.covered).toBe(550);
    expect(r.uncovered).toBe(250);
    for (const s of r.shares) {
      expect(s.amount).toBe(circle.find((c) => c.id === s.memberId)!.monthlyCap);
    }
  });

  it("counts what someone already gave this month", () => {
    const r = splitBill(100, [
      { id: "a", monthlyCap: 100, alreadyThisMonth: 100 },
      { id: "b", monthlyCap: 100 },
    ]);
    expect(r.shares).toEqual([{ memberId: "b", amount: 100 }]);
  });

  it("returns no shares when nobody has room", () => {
    const r = splitBill(50, []);
    expect(r).toEqual({ shares: [], covered: 0, uncovered: 50 });
  });

  it("rejects a non-positive bill", () => {
    expect(() => splitBill(0, circle)).toThrow();
  });
});
