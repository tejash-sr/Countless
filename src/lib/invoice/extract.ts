import { generateObject, type LanguageModelV1 } from "ai";
import { z } from "zod";

/**
 * The LLM's only job in Countless: read a bill and return what is printed on it.
 * It never decides benefit rules. Those live in the deterministic rules engine,
 * and anything the checks below flag goes to a human before money moves.
 */

export const BILL_CATEGORIES = [
  "vehicle_repair",
  "rent_or_mortgage",
  "utilities",
  "medical",
  "food",
  "education",
  "other",
] as const;

export const InvoiceSchema = z.object({
  vendorName: z.string(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable().describe("YYYY-MM-DD, or null if not printed"),
  dueDate: z.string().nullable().describe("YYYY-MM-DD, or null if not printed"),
  category: z
    .enum(BILL_CATEGORIES)
    .describe("What the bill pays for. Rent, mortgage, property tax and utilities are rent_or_mortgage or utilities."),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number() })),
  total: z.number().describe("Total amount due in US dollars"),
  vendorPayPalEmail: z.string().nullable().describe("Only if printed on the bill"),
  confidence: z.number().min(0).max(1).describe("How sure you are that every field is exactly as printed"),
});

export type ExtractedInvoice = z.infer<typeof InvoiceSchema>;

const INSTRUCTIONS = `You read bills for Countless, which pays bills directly to vendors.
Extract exactly what is printed. Do not guess, compute benefits, or give advice.
Use null for any field that is not printed. Amounts are US dollars as plain numbers.
Taxes, fees and shop supplies are line items, so line items should add up to the total.
Write names in normal capitalization (Main Street Auto Repair, not MAIN STREET AUTO REPAIR). /no_think`;

export type InvoiceInput = { text: string } | { image: Uint8Array; mimeType: string };

export async function extractInvoice(
  model: LanguageModelV1,
  input: InvoiceInput,
  providerOptions?: Record<string, Record<string, string>>,
): Promise<ExtractedInvoice> {
  const content =
    "text" in input
      ? [{ type: "text" as const, text: `${INSTRUCTIONS}\n\nBILL:\n${input.text}` }]
      : [
          { type: "text" as const, text: INSTRUCTIONS },
          { type: "image" as const, image: input.image, mimeType: input.mimeType },
        ];
  const { object } = await generateObject({
    model,
    schema: InvoiceSchema,
    messages: [{ role: "user", content }],
    providerOptions,
  });
  return object;
}

export interface ExtractionCheck {
  lineItemSum: number;
  arithmeticOk: boolean;
  needsHumanReview: boolean;
  reasons: string[];
}

/** Deterministic checks on the model's output. Any reason means a person confirms the fields. */
export function checkExtraction(inv: ExtractedInvoice, minConfidence = 0.85): ExtractionCheck {
  const cents = inv.lineItems.reduce((sum, li) => sum + Math.round(li.amount * 100), 0);
  const lineItemSum = cents / 100;
  const arithmeticOk = Math.abs(cents - Math.round(inv.total * 100)) <= 1;
  const reasons: string[] = [];
  if (inv.total <= 0) reasons.push("total must be more than $0");
  if (!arithmeticOk) {
    reasons.push(`line items add up to $${lineItemSum.toFixed(2)} but the total says $${inv.total.toFixed(2)}`);
  }
  if (inv.confidence < minConfidence) {
    reasons.push(`model confidence ${inv.confidence.toFixed(2)} is below ${minConfidence}`);
  }
  return { lineItemSum, arithmeticOk, needsHumanReview: reasons.length > 0, reasons };
}
