/**
 * Day-1 PayPal sandbox check for Countless.   Run:  npm run smoke:paypal
 *
 * Proves, against the real sandbox, the money flow the whole app depends on:
 *   1. OAuth works, and shows whether Vault and Payouts are enabled on the app.
 *   2. A donor saves PayPal once (Vault setup token -> donor approves -> payment token).
 *   3. Countless charges that saved PayPal for one share of a bill, paid straight to
 *      the vendor via purchase_units.payee, so Countless never holds the money.
 *   4. A second, different-sized share on the same saved PayPal (pro-rata settlement).
 *   5. Payouts to the vendor (the fallback rail if step 3 is refused).
 *
 * The saved payment token is kept in .smoke-state.json (gitignored) so re-runs skip
 * the browser approval. Delete that file to redo step 2.
 */
import "./load-env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PayPalApiError, PayPalRest } from "../src/lib/paypal/rest";

const STATE_FILE = ".smoke-state.json";

interface SmokeState {
  paymentTokenId?: string;
  customerId?: string;
  donorEmail?: string;
  savedAt?: string;
  lastOrderId?: string;
}

interface Link {
  href: string;
  rel: string;
}
interface SetupToken {
  id: string;
  status: string;
  links?: Link[];
}
interface PaymentToken {
  id: string;
  customer?: { id: string };
  payment_source?: { paypal?: { email_address?: string } };
}
interface Capture {
  id: string;
  status: string;
  amount: { value: string; currency_code: string };
}
interface Order {
  id: string;
  status: string;
  purchase_units?: {
    payee?: { email_address?: string; merchant_id?: string };
    payments?: { captures?: Capture[] };
  }[];
}
interface PayoutBatch {
  batch_header: { payout_batch_id: string; batch_status: string };
  items?: { transaction_status?: string; errors?: { name?: string; message?: string } }[];
}

let pp: PayPalRest; // built in main() so missing credentials print a clear message
const results: { step: string; ok: boolean; note: string }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readState(): SmokeState {
  if (!existsSync(STATE_FILE)) return {};
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SmokeState;
}

function writeState(state: SmokeState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set in .env.local (see .env.example)`);
  return value;
}

async function step<T>(
  name: string,
  fn: () => Promise<{ value: T; note: string }>,
): Promise<T | undefined> {
  console.log(`\n> ${name}`);
  try {
    const { value, note } = await fn();
    results.push({ step: name, ok: true, note });
    console.log(`  PASS  ${note}`);
    return value;
  } catch (err) {
    const note =
      err instanceof PayPalApiError
        ? `${err.message}${err.debugId ? ` (debug_id ${err.debugId})` : ""}`
        : (err as Error).message;
    results.push({ step: name, ok: false, note });
    console.log(`  FAIL  ${note}`);
    if (err instanceof PayPalApiError) console.log(JSON.stringify(err.body, null, 2));
    return undefined;
  }
}

async function saveDonorPayPal(): Promise<PaymentToken> {
  const setup = await pp.request<SetupToken>("POST", "/v3/vault/setup-tokens", {
    body: {
      payment_source: {
        paypal: {
          description: "Countless: pay your share of a friend's bills, straight to the vendor",
          usage_pattern: process.env.PAYPAL_VAULT_USAGE_PATTERN?.trim() || "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: false,
          experience_context: {
            brand_name: "Countless",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            return_url: "https://example.com/countless/vault-approved",
            cancel_url: "https://example.com/countless/vault-cancelled",
          },
        },
      },
    },
  });

  const approve = setup.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) {
    throw new Error(`setup token ${setup.id} has no approve link (status ${setup.status})`);
  }
  console.log(
    [
      "",
      "  Open this link in your browser, log in with a sandbox PERSONAL (donor) account,",
      "  and approve. You will land on example.com afterwards; that is expected.",
      "",
      `  ${approve}`,
      "",
      "  Waiting for approval (up to 10 minutes)...",
    ].join("\n"),
  );

  const deadline = Date.now() + 10 * 60_000;
  let status = setup.status;
  while (status !== "APPROVED") {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for approval (last status ${status})`);
    }
    await sleep(4000);
    status = (await pp.request<SetupToken>("GET", `/v3/vault/setup-tokens/${setup.id}`)).status;
  }

  return pp.request<PaymentToken>("POST", "/v3/vault/payment-tokens", {
    body: { payment_source: { token: { id: setup.id, type: "SETUP_TOKEN" } } },
  });
}

/** Charge one donor's share against their saved PayPal. With payeeEmail, the money goes to the vendor. */
async function chargeShare(
  paymentTokenId: string,
  amount: string,
  ref: string,
  payeeEmail?: string,
): Promise<{ order: Order; capture: Capture }> {
  const unit: Record<string, unknown> = {
    reference_id: ref,
    custom_id: ref,
    description: "Countless smoke test: one donor's share of a repair bill",
    amount: { currency_code: "USD", value: amount },
  };
  if (payeeEmail) unit.payee = { email_address: payeeEmail };

  let order = await pp.request<Order>("POST", "/v2/checkout/orders", {
    prefer: "return=representation",
    body: {
      intent: "CAPTURE",
      purchase_units: [unit],
      payment_source: { paypal: { vault_id: paymentTokenId } },
    },
  });
  if (order.status === "CREATED" || order.status === "APPROVED") {
    order = await pp.request<Order>("POST", `/v2/checkout/orders/${order.id}/capture`, {
      prefer: "return=representation",
    });
  }

  const unitOut = order.purchase_units?.[0];
  const capture = unitOut?.payments?.captures?.[0];
  if (order.status !== "COMPLETED" || !capture) {
    throw new Error(`order ${order.id} ended in status ${order.status} with no capture`);
  }
  if (payeeEmail) {
    const paidTo = unitOut?.payee?.email_address?.toLowerCase();
    if (paidTo && paidTo !== payeeEmail.toLowerCase()) {
      throw new Error(`order ${order.id} paid ${paidTo}, not the vendor ${payeeEmail}`);
    }
  }
  return { order, capture };
}

function printSummary(): void {
  console.log("\n================ SUMMARY ================");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}\n      ${r.note}`);

  const passed = (prefix: string) => results.some((r) => r.ok && r.step.startsWith(prefix));
  console.log("\nVerdict:");
  if (passed("3.") && passed("4.")) {
    console.log("  Design A works: saved pledges are charged straight to the vendor.");
    console.log("  Countless never holds the money.");
  } else if (passed("3b.")) {
    console.log("  Use design B: charge to the Countless sandbox account, then Payouts to the");
    console.log(`  vendor in the same settlement run${passed("5.") ? " (Payouts passed)" : " (Payouts FAILED: fix first)"}.`);
  } else {
    console.log("  Blocked. Paste the FAIL lines above to Claude (they contain no secrets).");
  }
}

async function main(): Promise<void> {
  console.log("Countless: Day-1 PayPal sandbox check");
  pp = new PayPalRest();
  const vendor = requireEnv("SANDBOX_VENDOR_EMAIL");
  const state = readState();

  const scopes = await step("1. OAuth and app features", async () => {
    const s = await pp.scopes();
    // Every app has the old v1 card-vault scope, so look for the v3 payment-tokens scope.
    const vault = s.some((x) => x.includes("vault/payment-tokens"));
    const payouts = s.some((x) => x.includes("payouts"));
    return {
      value: s,
      note: `token OK; Vault ${vault ? "enabled" : "not seen in scopes (step 2 will confirm)"}; Payouts ${payouts ? "enabled" : "not seen in scopes (step 5 will confirm)"}`,
    };
  });
  if (!scopes) return printSummary();

  let tokenId = state.paymentTokenId;
  if (tokenId) {
    const note = `reusing saved token for ${state.donorEmail ?? "donor"} from ${STATE_FILE} (delete it to redo)`;
    results.push({ step: "2. Donor saves PayPal (Vault)", ok: true, note });
    console.log(`\n> 2. Donor saves PayPal (Vault)\n  PASS  ${note}`);
  } else {
    const token = await step("2. Donor saves PayPal (Vault)", async () => {
      const t = await saveDonorPayPal();
      const email = t.payment_source?.paypal?.email_address ?? "donor";
      return { value: t, note: `payment token ${t.id} saved for ${email}` };
    });
    if (!token) return printSummary();
    tokenId = token.id;
    state.paymentTokenId = token.id;
    state.customerId = token.customer?.id;
    state.donorEmail = token.payment_source?.paypal?.email_address;
    state.savedAt = new Date().toISOString();
    writeState(state);
  }

  const run = Date.now();
  const direct = await step("3. Share #1 ($12.34) paid straight to the vendor (payee)", async () => {
    const { order, capture } = await chargeShare(tokenId!, "12.34", `smoke-${run}-a`, vendor);
    return {
      value: order,
      note: `order ${order.id} ${order.status}; capture ${capture.id} ${capture.status} $${capture.amount.value} -> ${vendor}`,
    };
  });

  let payee: string | undefined = vendor;
  if (!direct) {
    payee = undefined;
    await step("3b. Fallback: share #1 ($12.34) paid to the Countless account", async () => {
      const { order, capture } = await chargeShare(tokenId!, "12.34", `smoke-${run}-a2`);
      return { value: order, note: `order ${order.id} ${order.status}; capture ${capture.status}` };
    });
  }

  const second = await step(
    `4. Share #2 ($7.66) on the same saved PayPal${payee ? " -> vendor" : " -> Countless"}`,
    async () => {
      const { order, capture } = await chargeShare(tokenId!, "7.66", `smoke-${run}-b`, payee);
      return { value: order, note: `order ${order.id} ${order.status}; capture ${capture.status} $${capture.amount.value}` };
    },
  );
  if (second || direct) {
    state.lastOrderId = (second ?? direct)!.id;
    writeState(state);
  }

  await step("5. Payouts $5.00 to the vendor (fallback rail)", async () => {
    const created = await pp.request<PayoutBatch>("POST", "/v1/payments/payouts", {
      body: {
        sender_batch_header: {
          sender_batch_id: `countless_smoke_${run}`,
          email_subject: "Countless paid part of a bill",
          email_message: "Smoke-test payout from the Countless sandbox.",
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: vendor,
            amount: { value: "5.00", currency: "USD" },
            note: "Countless smoke test",
            sender_item_id: `item_${run}`,
          },
        ],
      },
    });
    const batchId = created.batch_header.payout_batch_id;
    let batch = created;
    for (let i = 0; i < 10 && ["PENDING", "PROCESSING"].includes(batch.batch_header.batch_status); i++) {
      await sleep(3000);
      batch = await pp.request<PayoutBatch>("GET", `/v1/payments/payouts/${batchId}`);
    }
    const item = batch.items?.[0];
    const itemStatus = item?.transaction_status ?? "unknown";
    if (batch.batch_header.batch_status === "DENIED" || ["FAILED", "RETURNED", "BLOCKED", "UNCLAIMED", "DENIED"].includes(itemStatus)) {
      throw new Error(
        `batch ${batchId} ${batch.batch_header.batch_status}; item ${itemStatus} ${item?.errors?.name ?? ""} ${item?.errors?.message ?? ""}`.trim(),
      );
    }
    return { value: batch, note: `batch ${batchId} ${batch.batch_header.batch_status}; item ${itemStatus}` };
  });

  printSummary();
}

main().catch((err) => {
  console.error(`\nStopped: ${(err as Error).message}`);
  process.exitCode = 1;
});
