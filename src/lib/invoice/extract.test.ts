import { describe, expect, it } from "vitest";
import { checkExtraction, type ExtractedInvoice } from "./extract";

const base: ExtractedInvoice = {
  vendorName: "Main Street Auto Repair",
  invoiceNumber: "4471",
  invoiceDate: "2026-11-06",
  dueDate: "2026-11-20",
  category: "vehicle_repair",
  lineItems: [
    { description: "Front brake pads and rotors", amount: 289 },
    { description: "Labor 2.0 hrs", amount: 180 },
    { description: "Shop supplies", amount: 12.5 },
    { description: "Sales tax", amount: 20.23 },
  ],
  total: 501.73,
  vendorPayPalEmail: null,
  confidence: 0.97,
};

describe("checkExtraction", () => {
  it("passes a bill whose line items add up and the model is confident", () => {
    const c = checkExtraction(base);
    expect(c.lineItemSum).toBe(501.73);
    expect(c.arithmeticOk).toBe(true);
    expect(c.needsHumanReview).toBe(false);
  });

  it("does not trip on floating-point sums (0.1 + 0.2 style)", () => {
    const inv = { ...base, lineItems: [{ description: "a", amount: 0.1 }, { description: "b", amount: 0.2 }], total: 0.3 };
    expect(checkExtraction(inv).arithmeticOk).toBe(true);
  });

  it("sends a bill to a human when line items and total disagree", () => {
    const c = checkExtraction({ ...base, total: 510 });
    expect(c.arithmeticOk).toBe(false);
    expect(c.needsHumanReview).toBe(true);
    expect(c.reasons[0]).toContain("$501.73");
  });

  it("sends a bill to a human when the model is unsure", () => {
    const c = checkExtraction({ ...base, confidence: 0.6 });
    expect(c.needsHumanReview).toBe(true);
    expect(c.reasons.join()).toContain("confidence");
  });

  it("rejects a zero total", () => {
    const c = checkExtraction({ ...base, lineItems: [], total: 0 });
    expect(c.needsHumanReview).toBe(true);
  });
});
