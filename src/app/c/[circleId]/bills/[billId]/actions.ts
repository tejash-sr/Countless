"use server";

import { redirect } from "next/navigation";
import { reviewSettlement } from "@/lib/agent/verify";
import { getBill, getCircle, listMembers, setBillStatus } from "@/lib/data";
import { settleBill } from "@/lib/settle";

/** After payment: a read-only agent checks every charge and the payout in PayPal and writes a receipt. */
export async function checkWithPayPalAction(circleId: string, billId: string): Promise<{ error: string }> {
  const bill = await getBill(circleId, billId);
  if (!bill?.settlement || bill.status === "awaiting_approval") return { error: "This bill hasn't been paid yet." };
  try {
    const review = await reviewSettlement(bill, await listMembers(circleId), bill.settlement);
    await setBillStatus(bill.id, bill.status, { ...bill.settlement, review });
  } catch (err) {
    return { error: `The check couldn't finish: ${(err as Error).message.slice(0, 160)}` };
  }
  redirect(`/c/${circleId}/bills/${billId}`);
}

/** The human approval step: nothing is charged until the organizer presses Approve. */
export async function approveAndPayAction(circleId: string, billId: string): Promise<{ error: string }> {
  const circle = await getCircle(circleId);
  const bill = circle ? await getBill(circleId, billId) : null;
  if (!circle || !bill) return { error: "This bill no longer exists." };
  if (bill.status !== "awaiting_approval") return { error: "This bill was already approved." };

  const result = await settleBill(bill, await listMembers(circleId), circle.organizerName);
  const after = await getBill(circleId, billId);
  // Refused before any money moved: say why here. Otherwise the page shows the full record.
  if (!result.ok && after?.status === "awaiting_approval") return { error: result.error };
  redirect(`/c/${circleId}/bills/${billId}`);
}
