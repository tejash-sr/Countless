"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addMember, getCircle, getMember, updateMemberPledge } from "@/lib/data";
import { startSavePayPal } from "@/lib/paypal/countless";

const JoinInput = z.discriminatedUnion("who", [
  z.object({
    who: z.literal("existing"),
    circleId: z.string().max(64),
    memberId: z.string().min(1).max(64),
    monthlyCap: z.coerce.number().min(5).max(2000),
  }),
  z.object({
    who: z.literal("new"),
    circleId: z.string().max(64),
    name: z.string().trim().min(2).max(80),
    relationship: z.string().trim().min(2).max(60),
    monthlyCap: z.coerce.number().min(5).max(2000),
  }),
]);

async function origin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Save the pledge, then send the donor to PayPal to save their PayPal once. */
export async function joinAction(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const raw = Object.fromEntries(formData);
  const who = raw.memberId === "new" ? "new" : "existing";
  const parsed = JoinInput.safeParse({ ...raw, who });
  if (!parsed.success) return { error: "Choose who you are, and a monthly limit between $5 and $2,000." };
  const input = parsed.data;

  const circle = await getCircle(input.circleId);
  if (!circle) return { error: "This circle no longer exists." };

  let memberId: string;
  if (input.who === "existing") {
    const member = await getMember(circle.id, input.memberId);
    if (!member) return { error: "We couldn't find that person in the circle." };
    if (member.vaultTokenId) return { error: `${member.name} has already saved PayPal.` };
    memberId = member.id;
  } else {
    memberId = await addMember({
      circleId: circle.id,
      name: input.name,
      relationship: input.relationship,
      monthlyCap: input.monthlyCap,
    });
  }

  const base = await origin();
  let approveUrl: string;
  try {
    const started = await startSavePayPal({
      returnUrl: `${base}/join/${circle.id}/saved?member=${memberId}`,
      cancelUrl: `${base}/join/${circle.id}?cancelled=1`,
      requestId: `join-${memberId}-${Date.now()}`,
    });
    await updateMemberPledge(memberId, input.monthlyCap, started.setupTokenId);
    approveUrl = started.approveUrl;
  } catch (err) {
    console.error("[joinAction]", (err as Error).message);
    return { error: "PayPal is not responding right now. Please try again in a minute." };
  }
  redirect(approveUrl);
}
