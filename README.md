# Countless

**Friends and family pay a disabled person's bills straight to the vendor, so their SSI check isn't cut.**

Built for the PayPal AI Hackathon with **PayPal (Vault, Orders v2, Payouts, Agent Toolkit)** and **Groq** (vision model to read bills).

## The problem

About 7.4 million Americans live on Supplemental Security Income (SSI). The maximum federal payment in 2026 is $994 a month, and the rules punish generosity: if a brother sends $500 in cash to fix a car, the Social Security Administration counts it as income, and two months later the SSI check shrinks by hundreds of dollars. The same help paid directly to the repair shop costs nothing, because a third party paying a vendor for non-shelter items is not income (POMS SI 00815.400).

Families don't know this rule, and even those who do have no easy way to pool money and pay a vendor together. Countless does that.

## What it does

1. **Snap the bill.** An organizer photographs a bill. A Groq vision model reads the vendor, line items, total and the vendor's PayPal email. Deterministic checks (line items must add up to the cent, confidence threshold) send anything doubtful to a person.
2. **See what each route would cost.** A deterministic SSI rules engine compares paying in cash, paying the vendor directly and contributing to an ABLE account, month by month, with a citation to the SSA rule (POMS) behind every number. Example: $501.73 in cash in Nov 2026 cuts the Jan 2027 check from $1,029 to $607.27 (a loss of $421.73); paid to the vendor, it costs $0.
3. **Split it fairly.** The bill is split across the circle's members, within each person's monthly limit, cent-exact.
4. **Donors save PayPal once.** Each member saves their PayPal account with PayPal Vault (no purchase), so future bills need no checkout.
5. **A person approves; money moves.** When the organizer approves, Countless charges each saved PayPal account its share (Orders v2 with the vault token) and immediately pays the vendor the total with PayPal Payouts. The ledger shows money in and money out netting to $0, and the recipient never receives cash.

6. **An agent checks the money with PayPal.** After payment, a read-only Groq agent (openai/gpt-oss-120b) uses the PayPal Agent Toolkit's `get_order` tool to look up every charge, plus a payout lookup tool for the vendor payment, compares them with what was expected, and writes a plain-language receipt marked "Verified with PayPal" or "Needs attention". It has no tool that can move money.

7. **One ledger for every dollar.** The circle's Ledger page (AG Grid) lists every charge and payout with its PayPal reference, PayPal status and the agent's verdict, searchable and sortable, with money in, money out and "held by Countless" (always $0.00).

The AI never decides benefit rules and never moves money on its own: one model reads documents, one agent audits with read-only tools; rules are code with tests; a human presses Approve.

## How PayPal is used

| Step | PayPal API |
|---|---|
| Donor saves PayPal without paying | Vault v3: setup token → buyer approval → payment token |
| Charge each donor's share | Orders v2 `intent: CAPTURE` with `payment_source.paypal.vault_id` |
| Pay the vendor | Payouts v1 to the vendor's PayPal email |
| Audit after payment | `@paypal/agent-toolkit` `get_order` (forced to sandbox) + `GET /v1/payments/payouts/{id}`, driven by a Groq agent |

We tested charging the vault token straight to the vendor as a third-party payee; PayPal returns `422 BILLING_AGREEMENT_NOT_FOUND` because the billing agreement belongs to the platform. So Countless acts as a pass-through (like a fiscal sponsor): shares are captured and paid out in the same settlement run.

Everything runs in the **PayPal sandbox only**. `src/lib/paypal/rest.ts` refuses non-sandbox hosts.

## SSI rules engine

`src/lib/ssi/` holds dated, cited parameters and a pure simulator (16 tests):

- Federal benefit rate $994 (2026), $1,029 (2027) · $20 general income exclusion (SI 00810.420)
- Retrospective monthly accounting: income in month M affects the check in M+2 (SI 02005.001)
- $60 per quarter infrequent-income exclusion (SI 00810.410)
- In-kind support and maintenance for shelter, capped at the presumed maximum value (SI 00835.300, SI 00835.350); food removed from ISM on 9/30/2024
- $2,000 resource limit, first-of-month rule (20 CFR 416.1205, SI 01110.600)
- ABLE accounts: $100,000 excluded, annual contribution limit (SI 01130.740)

Scope: an individual in their own household with no earned income. This is a demo, not legal or benefits advice.

## Run it locally

Requirements: Node 22+, a PayPal developer account (US sandbox accounts; Vault isn't available for India accounts) and a Groq API key.

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

`.env.local`:

| Variable | Value |
|---|---|
| `PAYPAL_ENV` | `sandbox` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app (enable Vault and Payouts) |
| `SANDBOX_VENDOR_EMAIL` | A sandbox business account for the repair shop |
| `SANDBOX_LANDLORD_EMAIL` | A sandbox business account for the landlord |
| `PAYPAL_VAULT_USAGE_PATTERN` | `IMMEDIATE` |
| `GROQ_API_KEY` | From console.groq.com |
| `GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` (enable it in your Groq project limits) |
| `GROQ_AGENT_MODEL` | `openai/gpt-oss-120b` |

The database is PGlite (Postgres in WebAssembly) in `.data/`, created and seeded on first run. Set `DATABASE_URL` to use a real Postgres instead.

### Try the demo

1. Open `/c/rosa`: Rosa's circle with four members.
2. **Add a bill** → **Use the sample bill** (`public/samples/main-street-auto-4471.png`) → review the route meter → Save.
3. Open `/join/rosa`, pick each member and save PayPal with a sandbox personal account.
4. Open the bill and press **Approve and pay**. The "What moved" ledger shows each capture and the vendor payout.

### Checks

```bash
npm test            # 26 unit tests (rules engine, split, extraction checks)
npm run typecheck
npm run smoke:paypal  # Vault → charge → Payouts against the sandbox
npm run smoke:ai      # Groq bill reading
```

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · AG Grid (ledger) · Vercel AI SDK + Groq · PayPal REST APIs + Agent Toolkit · PGlite / Postgres · Vitest

## License

MIT, see [LICENSE](LICENSE). The demo people, bills and accounts are synthetic.
