"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getModel, VISION_PROVIDER_OPTIONS } from "@/lib/ai/model";
import { createBill, getCircle, listMembers } from "@/lib/data";
import { currentMonth } from "@/lib/format";
import { BILL_CATEGORIES, checkExtraction, extractInvoice, type ExtractedInvoice } from "@/lib/invoice/extract";
import { splitBill } from "@/lib/split";

export type ReadResult =
  | {
      ok: true;
      invoice: ExtractedInvoice;
      needsReview: boolean;
      reasons: string[];
      model: string;
      ms: number;
      source: "photo" | "text";
    }
  | { ok: false; error: string };

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = /^image\/(jpeg|png|webp)$/;

/** AI step: read a bill photo (or typed text) into fields. Nothing is stored here. */
export async function readBillAction(formData: FormData): Promise<ReadResult> {
  const photo = formData.get("photo");
  const text = formData.get("text");
  const started = performance.now();
  try {
    let invoice: ExtractedInvoice;
    let source: "photo" | "text";
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large. Use one under 5 MB." };
      if (!PHOTO_TYPES.test(photo.type)) return { ok: false, error: "Use a JPG, PNG or WebP photo of the bill." };
      invoice = await extractInvoice(
        getModel("vision"),
        { image: new Uint8Array(await photo.arrayBuffer()), mimeType: photo.type },
        VISION_PROVIDER_OPTIONS,
      );
      source = "photo";
    } else if (typeof text === "string" && text.trim().length >= 10) {
      invoice = await extractInvoice(getModel("vision"), { text: text.slice(0, 8000) }, VISION_PROVIDER_OPTIONS);
      source = "text";
    } else {
      return { ok: false, error: "Add a photo of the bill, or type what it says." };
    }
    const check = checkExtraction(invoice);
    return {
      ok: true,
      invoice,
      needsReview: check.needsHumanReview,
      reasons: check.reasons,
      model: process.env.GROQ_VISION_MODEL ?? "",
      ms: Math.round(performance.now() - started),
      source,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[readBillAction]", message);
    if (/rate.?limit|429|quota|too many/i.test(message)) {
      return { ok: false, error: "The AI service is at its free-plan limit. Wait a minute, or type the bill instead." };
    }
    return { ok: false, error: "Countless couldn't read that bill. Try a clearer photo, or type it instead." };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const NewBillInput = z.object({
  circleId: z.string().min(1).max(64),
  vendorName: z.string().trim().min(1).max(120),
  vendorPayPalEmail: z.string().trim().email().max(200).nullable(),
  invoiceNumber: z.string().trim().max(60).nullable(),
  invoiceDate: isoDate,
  dueDate: isoDate,
  category: z.enum(BILL_CATEGORIES),
  total: z.number().positive().max(100_000),
  lineItems: z.array(z.object({ description: z.string().max(200), amount: z.number() })).max(50),
  route: z.enum(["vendor_direct", "able_contribution"]),
  extraction: z
    .object({
      model: z.string().max(80),
      confidence: z.number().min(0).max(1),
      ms: z.number().nonnegative(),
      reasons: z.array(z.string().max(300)).max(10),
      source: z.enum(["photo", "text"]),
    })
    .nullable(),
});

export type NewBillPayload = z.infer<typeof NewBillInput>;

/** Save the confirmed bill with the circle's shares. The split is recomputed here, never trusted from the browser. */
export async function createBillAction(payload: NewBillPayload): Promise<{ error: string }> {
  const parsed = NewBillInput.safeParse(payload);
  if (!parsed.success) return { error: "Some bill details are missing or invalid. Check the fields above." };
  const bill = parsed.data;
  if (bill.route === "vendor_direct" && !bill.vendorPayPalEmail) {
    return { error: "Add the vendor's PayPal email so Countless can pay them directly." };
  }
  const circle = await getCircle(bill.circleId);
  if (!circle) return { error: "This circle no longer exists." };
  const members = await listMembers(circle.id);
  const { shares } = splitBill(
    bill.total,
    members.map((m) => ({ id: m.id, monthlyCap: m.monthlyCap })),
  );
  const id = await createBill({ ...bill, giftMonth: currentMonth(), shares });
  redirect(`/c/${circle.id}/bills/${id}`);
}
