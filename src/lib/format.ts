export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** "2026-11-20" -> "Nov 20, 2026" (date-only strings, no time zone drift). */
export function shortDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2027-01" -> "Jan 2027" */
export function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The month money moves in, "YYYY-MM". DEMO_MONTH pins it for a reproducible demo. */
export function currentMonth(now = new Date()): string {
  const pinned = process.env.DEMO_MONTH?.trim();
  if (pinned && /^\d{4}-(0[1-9]|1[0-2])$/.test(pinned)) return pinned;
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  vehicle_repair: "Car repair",
  rent_or_mortgage: "Rent or mortgage",
  utilities: "Utilities",
  medical: "Medical",
  food: "Food",
  education: "Education",
  other: "Other",
};
