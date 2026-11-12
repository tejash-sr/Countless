import { PayPalRest } from "./rest";

/**
 * The PayPal money flow Countless uses, as proven against the sandbox on Day 1:
 *   1. A donor saves PayPal once (Vault setup token -> donor approves -> payment token).
 *   2. At settlement, each share is charged to the Countless account (merchant-initiated).
 *   3. Countless pays the vendor with Payouts in the same run.
 * Charging a vaulted token straight to a third-party payee is refused by PayPal
 * (BILLING_AGREEMENT_NOT_FOUND), which is why step 3 exists.
 */

let client: PayPalRest | undefined;
const pp = () => (client ??= new PayPalRest());

interface Link {
  href: string;
  rel: string;
}

export async function startSavePayPal(opts: { returnUrl: string; cancelUrl: string; requestId: string }) {
  const setup = await pp().request<{ id: string; status: string; links?: Link[] }>("POST", "/v3/vault/setup-tokens", {
    requestId: opts.requestId,
    body: {
      payment_source: {
        paypal: {
          description: "Countless: your share of bills, paid straight to the vendor",
          usage_pattern: process.env.PAYPAL_VAULT_USAGE_PATTERN?.trim() || "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: false,
          experience_context: {
            brand_name: "Countless",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
          },
        },
      },
    },
  });
  const approveUrl = setup.links?.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error(`PayPal returned no approval link (status ${setup.status})`);
  return { setupTokenId: setup.id, approveUrl };
}

export async function finishSavePayPal(setupTokenId: string) {
  const token = await pp().request<{ id: string; payment_source?: { paypal?: { email_address?: string } } }>(
    "POST",
    "/v3/vault/payment-tokens",
    { requestId: `vault-${setupTokenId}`, body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } } },
  );
  return { vaultTokenId: token.id, paypalEmail: token.payment_source?.paypal?.email_address ?? null };
}

interface Order {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
}

/** Charge one saved PayPal for one share. The request id makes a retry safe: PayPal won't charge twice. */
export async function chargeShare(vaultTokenId: string, amount: number, ref: string, description: string) {
  let order = await pp().request<Order>("POST", "/v2/checkout/orders", {
    requestId: ref,
    prefer: "return=representation",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        { reference_id: ref, custom_id: ref, description, amount: { currency_code: "USD", value: amount.toFixed(2) } },
      ],
      payment_source: { paypal: { vault_id: vaultTokenId } },
    },
  });
  if (order.status === "CREATED" || order.status === "APPROVED") {
    order = await pp().request<Order>("POST", `/v2/checkout/orders/${order.id}/capture`, {
      requestId: `${ref}-capture`,
      prefer: "return=representation",
    });
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status !== "COMPLETED" || !capture) throw new Error(`Order ${order.id} ended ${order.status}`);
  return { orderId: order.id, captureStatus: capture.status };
}

export async function payVendor(email: string, amount: number, ref: string, note: string) {
  const batch = await pp().request<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "POST",
    "/v1/payments/payouts",
    {
      requestId: ref,
      body: {
        sender_batch_header: {
          sender_batch_id: ref,
          email_subject: "You've been paid through Countless",
          email_message: note,
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: email,
            amount: { value: amount.toFixed(2), currency: "USD" },
            note,
            sender_item_id: ref,
          },
        ],
      },
    },
  );
  return { batchId: batch.batch_header.payout_batch_id, status: batch.batch_header.batch_status };
}
