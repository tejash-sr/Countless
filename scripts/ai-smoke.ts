/**
 * Day-1 AI check for Countless.   Run:  npm run smoke:ai
 *
 *   1. The Groq vision model reads a (synthetic) repair invoice into structured
 *      fields, and the deterministic checks decide whether a human must confirm them.
 *   2. The Groq agent model drives the PayPal Agent Toolkit in the sandbox
 *      (tool calling end to end).
 */
import "./load-env";
import { existsSync, readFileSync } from "node:fs";
import { generateText } from "ai";
import { getModel, VISION_PROVIDER_OPTIONS } from "../src/lib/ai/model";
import { checkExtraction, extractInvoice } from "../src/lib/invoice/extract";
import { paypalToolkit } from "../src/lib/paypal/toolkit";

const SAMPLE_INVOICE = `MAIN STREET AUTO REPAIR
1180 Main St, Dayton, OH 45402      (937) 555-0142
INVOICE #4471          Date: 11/06/2026          Due: 11/20/2026
Customer: Rosa M.      Vehicle: 2014 Honda Fit
Front brake pads and rotors (parts)          $289.00
Labor 2.0 hrs @ $90.00                       $180.00
Shop supplies                                 $12.50
Sales tax                                     $20.23
TOTAL DUE                                    $501.73`;

async function main(): Promise<void> {
  const vision = getModel("vision");
  const agent = getModel("agent");
  console.log(
    `Countless: Day-1 AI check (Groq; vision ${process.env.GROQ_VISION_MODEL}, agent ${process.env.GROQ_AGENT_MODEL})`,
  );

  console.log("\n> 1. The vision model reads a repair invoice");
  const t0 = Date.now();
  const invoice = await extractInvoice(vision, { text: SAMPLE_INVOICE }, VISION_PROVIDER_OPTIONS);
  const check = checkExtraction(invoice);
  console.log(JSON.stringify(invoice, null, 2));
  console.log(
    `  ${check.needsHumanReview ? "REVIEW" : "PASS"}  ${Date.now() - t0} ms; ` +
      `line items $${check.lineItemSum.toFixed(2)} vs total $${invoice.total.toFixed(2)}` +
      (check.reasons.length ? `; ${check.reasons.join("; ")}` : ""),
  );

  console.log("\n> 2. The agent model drives the PayPal Agent Toolkit (sandbox)");
  const state = existsSync(".smoke-state.json")
    ? (JSON.parse(readFileSync(".smoke-state.json", "utf8")) as { lastOrderId?: string })
    : {};
  const tools = paypalToolkit({ orders: { create: true, get: true } }).getTools();
  const prompt = state.lastOrderId
    ? `Look up PayPal order ${state.lastOrderId} and tell me in one sentence its status, amount, and which account was paid.`
    : `Create a PayPal order for 1.00 USD described as "Countless toolkit check", then look it up and tell me its id and status in one sentence.`;
  const { text, steps } = await generateText({ model: agent, tools, maxSteps: 5, prompt });
  const calls = steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
  console.log(`  tools called: ${calls.join(", ") || "none"}`);
  console.log(`  answer: ${text}`);
  console.log(calls.length ? "  PASS" : "  FAIL  the model answered without calling a PayPal tool");
}

main().catch((err) => {
  console.error(`\nStopped: ${(err as Error).message}`);
  process.exitCode = 1;
});
