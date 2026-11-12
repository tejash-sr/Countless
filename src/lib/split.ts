export interface Pledger {
  id: string;
  monthlyCap: number;
  /** Already charged this calendar month; reduces the room left under the cap. */
  alreadyThisMonth?: number;
}

export interface Share {
  memberId: string;
  amount: number;
}

export interface SplitResult {
  shares: Share[];
  covered: number;
  uncovered: number;
}

/**
 * Split a bill across the circle in proportion to each person's remaining
 * monthly limit. Whole cents, largest-remainder rounding, never above anyone's
 * limit. If the circle cannot cover the bill, `uncovered` says how much is left.
 */
export function splitBill(total: number, pledgers: Pledger[]): SplitResult {
  if (!(total > 0)) throw new Error("Bill total must be more than $0");
  const totalCents = Math.round(total * 100);

  const room = pledgers
    .map((p) => ({
      id: p.id,
      cents: Math.max(0, Math.round(p.monthlyCap * 100) - Math.round((p.alreadyThisMonth ?? 0) * 100)),
    }))
    .filter((p) => p.cents > 0);
  const capacity = room.reduce((s, p) => s + p.cents, 0);
  const cover = Math.min(totalCents, capacity);
  if (cover === 0) return { shares: [], covered: 0, uncovered: total };

  const raw = room.map((p, i) => {
    const exact = (cover * p.cents) / capacity;
    return { i, id: p.id, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let leftover = cover - raw.reduce((s, r) => s + r.floor, 0);
  const byRemainder = [...raw].sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const r of byRemainder) {
    if (leftover === 0) break;
    r.floor += 1;
    leftover -= 1;
  }

  return {
    shares: raw.filter((r) => r.floor > 0).map((r) => ({ memberId: r.id, amount: r.floor / 100 })),
    covered: cover / 100,
    uncovered: (totalCents - cover) / 100,
  };
}
