import { randomUUID } from "node:crypto";

/**
 * Minimal PayPal REST client used for the parts the Agent Toolkit does not
 * cover (Vault payment tokens, orders with a third-party payee, Payouts).
 * Sandbox only: the hackathon rules require the sandbox, and refusing live
 * credentials here makes an accidental real-money call impossible.
 */

const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
}

export function paypalConfigFromEnv(): PayPalConfig {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.local (see .env.example)",
    );
  }
  const env = (process.env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();
  if (env !== "sandbox") {
    throw new Error(`PAYPAL_ENV is "${env}". Countless only runs against the PayPal sandbox.`);
  }
  return { clientId, clientSecret };
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  error?: string;
  error_description?: string;
  details?: { issue?: string; description?: string; field?: string }[];
}

export class PayPalApiError extends Error {
  readonly status: number;
  readonly issue?: string;
  readonly debugId?: string;
  readonly body: unknown;

  constructor(status: number, body: unknown, method: string, path: string) {
    const b = (body ?? {}) as PayPalErrorBody;
    const issue = b.details?.[0]?.issue ?? b.name ?? b.error;
    const description =
      b.details?.[0]?.description ?? b.message ?? b.error_description ?? "";
    super(`${method} ${path} -> HTTP ${status} ${issue ?? ""} ${description}`.trim());
    this.name = "PayPalApiError";
    this.status = status;
    this.issue = issue;
    this.debugId = b.debug_id;
    this.body = body;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  /** Idempotency key. Pass a stable value when a retry must not double-charge. */
  requestId?: string;
  prefer?: "return=minimal" | "return=representation";
}

export class PayPalRest {
  private token?: { value: string; scopes: string[]; expiresAt: number };

  constructor(private readonly cfg: PayPalConfig = paypalConfigFromEnv()) {}

  get baseUrl(): string {
    return SANDBOX_BASE_URL;
  }

  /** OAuth scopes granted to this app; shows whether Vault/Payouts are enabled. */
  async scopes(): Promise<string[]> {
    await this.accessToken();
    return this.token?.scopes ?? [];
  }

  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) {
      return this.token.value;
    }
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await parseBody(res);
    if (!res.ok) throw new PayPalApiError(res.status, body, "POST", "/v1/oauth2/token");
    const b = body as { access_token: string; expires_in: number; scope?: string };
    this.token = {
      value: b.access_token,
      scopes: (b.scope ?? "").split(" ").filter(Boolean),
      expiresAt: Date.now() + b.expires_in * 1000,
    };
    return this.token.value;
  }

  async request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      "Content-Type": "application/json",
    };
    if (method === "POST") headers["PayPal-Request-Id"] = opts.requestId ?? randomUUID();
    if (opts.prefer) headers.Prefer = opts.prefer;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const body = await parseBody(res);
    if (!res.ok) throw new PayPalApiError(res.status, body, method, path);
    return body as T;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}
