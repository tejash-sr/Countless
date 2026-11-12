import { generateText, tool } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model";
import type { Bill, Member, Settlement } from "@/lib/data";
import { PayPalRest } from "@/lib/paypal/rest";
import { paypalToolkit } from "@/lib/paypal/toolkit";

/** What the agent found when it checked a settlement against PayPal. */
export type AgentReview = NonNullable<Settlement["review"]>;

type Json = Record<string, unknown>;
const asJson = (v: unknown): Json => {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Json;
    } catch {
      return { raw: v.slice(0, 400) };
    }
  }
  return (v ?? {}) as Json;
};

/** Keep only the fields the agent needs, so a 4-order check fits Groq's free token budget. */
function compactOrder(raw: unknown) {
  const o = asJson(raw);
  const pu = (o.purchase_units as Json[] | undefined)?.[0];
  const cap = ((pu?.payments as Json | undefined)?.captures as Json[] | undefined)?.[0];
  return {
    id: o.id,
    status: o.status,
    amount: (cap?.amount as Json | undefined)?.value ?? (pu?.amount as Json | undefined)?.value,
    capture_status: cap?.status,
    payer: (o.payer as Json | undefined)?.email_address,
    error: o.error ?? o.message,
  };
}

type AnyTool = { description?: string; parameters: unknown; execute?: (a: unknown, o: unknown) => Promise<unknown> };

/**
 * A read-only agent: after a person approved and money moved, it looks every
 * charge and the vendor payout up in PayPal itself and writes a plain receipt.
 * It has no tool that can move money.
 */
export async function reviewSettlement(bill: Bill, members: Member[], s: Settlement): Promise<AgentReview> {
  const started = Date.now();
  const toolkit = paypalToolkit({ orders: { get: true } }).getTools() as unknown as Record<string, AnyTool>;
  const getOrder = toolkit.get_order;
  if (!getOrder?.execute) throw new Error("PayPal Agent Toolkit get_order is not available");
  const toolCalls: AgentReview["toolCalls"] = [];
  const results: { tool: string; target: string; result: unknown }[] = [];

  const tools = {
    get_order: {
      ...getOrder,
      execute: async (args: unknown, opts: unknown) => {
        const a = (args ?? {}) as Json;
        const target = String(a.id ?? a.order_id ?? "");
        toolCalls.push({ tool: "get_order", target });
        const result = compactOrder(await getOrder.execute!(args, opts));
        results.push({ tool: "get_order", target, result });
        return result;
      },
    },
    get_payout_batch: tool({
      description: "Look up a PayPal Payouts batch by its payout_batch_id and return its status and amount.",
      parameters: z.object({ payout_batch_id: z.string() }),
      execute: async ({ payout_batch_id }) => {
        toolCalls.push({ tool: "get_payout_batch", target: payout_batch_id });
        try {
          const b = await new PayPalRest().request<Json>("GET", `/v1/payments/payouts/${encodeURIComponent(payout_batch_id)}`);
          const h = b.batch_header as Json;
          const item = (b.items as Json[] | undefined)?.[0];
          const result = {
            batch_status: h?.batch_status,
            amount: (h?.amount as Json | undefined)?.value,
            item_status: item?.transaction_status,
            receiver: ((item?.payout_item as Json | undefined)?.receiver as string | undefined) ?? null,
          };
          results.push({ tool: "get_payout_batch", target: payout_batch_id, result });
          return result;
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),
  };

  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const expected = [
    ...s.charges.map((c) => `- ${name(c.memberId)}: order ${c.orderId ?? "(none)"}, expected $${c.amount.toFixed(2)}`),
    s.payout?.batchId
      ? `- Vendor payout: batch ${s.payout.batchId}, expected $${s.payout.amount.toFixed(2)} to ${s.payout.to}`
      : `- Vendor payout: ${s.payout?.status ?? "none"}`,
  ].join("\n");

  const { text: first } = await generateText({
    model: getModel("agent"),
    tools: tools as never,
    maxSteps: 8,
    providerOptions: { groq: { reasoningFormat: "hidden" } },
    prompt: `You audit payments for Countless. ${bill.vendorName}'s bill of $${bill.total.toFixed(2)} was paid for a person on SSI.
Look up EVERY order with get_order (you can call several tools at once) and the payout with get_payout_batch, then compare with what we expected:
${expected}

Then write 2-3 short plain-English sentences for the family: who paid what, whether ${bill.vendorName} received the money, and that the person on SSI never received cash. No jargon, no IDs.
On the last line write exactly VERIFIED if every order is COMPLETED with the expected amount and the payout succeeded or is pending/processing; otherwise write NEEDS ATTENTION and say what is wrong.`,
  });

  // If the agent spent its steps on lookups, write the receipt from what it found (no tools this time).
  let text = first.trim();
  if (!/(VERIFIED|NEEDS ATTENTION)\**\s*$/i.test(text)) {
    if (s.payout?.batchId && !results.some((r) => r.tool === "get_payout_batch")) {
      await tools.get_payout_batch.execute!({ payout_batch_id: s.payout.batchId }, { toolCallId: "final", messages: [] });
    }
    const fin = await generateText({
      model: getModel("agent"),
      providerOptions: { groq: { reasoningFormat: "hidden" } },
      prompt: `You audit payments for Countless. Expected:
${expected}

What PayPal returned:
${JSON.stringify(results)}

Write 2-3 short plain-English sentences for the family: who paid what, whether ${bill.vendorName} received the money, and that the person on SSI never received cash. No jargon, no IDs.
On the last line write exactly VERIFIED if every order is COMPLETED with the expected amount and the payout succeeded or is pending/processing; otherwise write NEEDS ATTENTION and say what is wrong.`,
    });
    text = fin.text.trim();
  }

  const verified = /VERIFIED\**\s*$/.test(text) && !/NEEDS ATTENTION/i.test(text);
  return {
    verdict: verified ? "verified" : "needs_attention",
    summary: text.replace(/\n?\s*\**(VERIFIED|NEEDS ATTENTION)\**\s*$/i, "").trim(),
    toolCalls,
    model: process.env.GROQ_AGENT_MODEL ?? "agent",
    checkedAt: new Date().toISOString(),
    ms: Date.now() - started,
  };
}
