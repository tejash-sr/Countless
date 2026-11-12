import { claimBillForSettlement, setBillStatus, type Bill, type Member, type Settlement } from "./data";
import { chargeShare, payVendor } from "./paypal/countless";

export type SettleResult = { ok: true; settlement: Settlement } | { ok: false; error: string };

/**
 * Pay a bill after a person approved it:
 *   charge each share against the donor's saved PayPal (to the Countless account),
 *   then pay the vendor the total actually collected, via Payouts, in the same run.
 * Idempotent per bill: PayPal request ids are derived from the bill and member ids.
 */
export async function settleBill(bill: Bill, members: Member[], approvedBy: string): Promise<SettleResult> {
  const missing = bill.shares
    .map((s) => members.find((m) => m.id === s.memberId))
    .filter((m) => !m?.vaultTokenId);
  if (missing.length) {
    return {
      ok: false,
      error: `${missing.map((m) => m?.name ?? "A member").join(", ")} still need${missing.length === 1 ? "s" : ""} to save PayPal.`,
    };
  }
  if (bill.route === "vendor_direct" && !bill.vendorPayPalEmail) {
    return { ok: false, error: "This bill has no vendor PayPal email." };
  }
  if (!(await claimBillForSettlement(bill.id))) {
    return { ok: false, error: "This bill is already being paid or was paid." };
  }

  const settlement: Settlement = { approvedBy, approvedAt: new Date().toISOString(), charges: [] };
  const what = `${bill.vendorName}${bill.invoiceNumber ? ` invoice ${bill.invoiceNumber}` : ""}`;

  for (const share of bill.shares) {
    const member = members.find((m) => m.id === share.memberId)!;
    try {
      const r = await chargeShare(member.vaultTokenId!, share.amount, `cl-${bill.id}-${member.id}`, `Your share of ${what}`);
      settlement.charges.push({ memberId: member.id, amount: share.amount, orderId: r.orderId, status: r.captureStatus });
    } catch (err) {
      settlement.charges.push({ memberId: member.id, amount: share.amount, status: "FAILED", error: (err as Error).message });
    }
  }

  const collected =
    settlement.charges.filter((c) => c.status !== "FAILED").reduce((s, c) => s + Math.round(c.amount * 100), 0) / 100;
  const allCharged = settlement.charges.every((c) => c.status !== "FAILED");

  if (bill.route === "able_contribution") {
    // ABLE accounts don't accept PayPal; the deposit leg is simulated and labelled as such.
    settlement.payout = { amount: collected, to: "ABLE account (simulated)", status: "SIMULATED" };
  } else if (collected > 0) {
    try {
      const p = await payVendor(bill.vendorPayPalEmail!, collected, `cl-${bill.id}-payout`, `Payment for ${what}, from Countless`);
      settlement.payout = { batchId: p.batchId, amount: collected, to: bill.vendorPayPalEmail!, status: p.status };
    } catch (err) {
      settlement.payout = { amount: collected, to: bill.vendorPayPalEmail!, status: "FAILED", error: (err as Error).message };
    }
  }

  const ok = allCharged && settlement.payout?.status !== "FAILED";
  await setBillStatus(bill.id, ok ? "paid" : "failed", settlement);
  return ok ? { ok: true, settlement } : { ok: false, error: "Some payments did not go through. See the details below." };
}
