"use client";

import { AlertTriangle, Camera, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { buildRouteOptions, recommendedRoute, RouteMeter } from "@/components/route-meter";
import { AiTag, Callout, buttonClass } from "@/components/ui";
import type { Circle, Member } from "@/lib/data";
import { CATEGORY_LABEL, usd } from "@/lib/format";
import { expenseKindFor, type GiftRoute } from "@/lib/ssi/engine";
import { splitBill } from "@/lib/split";
import { createBillAction, readBillAction, type ReadResult } from "./actions";

type Read = Extract<ReadResult, { ok: true }>;
type Category = Read["invoice"]["category"];

interface Draft {
  vendorName: string;
  vendorPayPalEmail: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  category: Category;
  total: string;
}

const SAMPLE_BILL = "/samples/main-street-auto-4471.png";

/** Shrink phone photos before upload: faster, cheaper, and under the AI's image limits. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "bill.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const field =
  "mt-1 block h-11 w-full rounded-lg border border-rule-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-action";
const labelText = "text-sm font-medium text-ink-2";

export function BillFlow({
  circle,
  members,
  giftMonth,
}: {
  circle: Circle;
  members: Member[];
  giftMonth: string;
}) {
  const [stage, setStage] = useState<"start" | "reading" | "review">("start");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [read, setRead] = useState<Read | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [route, setRoute] = useState<GiftRoute | null>(null);
  const [saving, startSaving] = useTransition();
  const first = circle.recipientFirstName;

  async function send(fd: FormData) {
    setStage("reading");
    setError(null);
    const r = await readBillAction(fd);
    if (!r.ok) {
      setError(r.error);
      setStage("start");
      return;
    }
    const inv = r.invoice;
    setRead(r);
    setDraft({
      vendorName: inv.vendorName,
      vendorPayPalEmail: inv.vendorPayPalEmail ?? "",
      invoiceNumber: inv.invoiceNumber ?? "",
      invoiceDate: inv.invoiceDate ?? "",
      dueDate: inv.dueDate ?? "",
      category: inv.category,
      total: inv.total.toFixed(2),
    });
    setRoute(null);
    setStage("review");
  }

  async function readPhoto(file: File) {
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append("photo", await shrink(file));
    await send(fd);
  }

  async function readSample() {
    const res = await fetch(SAMPLE_BILL);
    const blob = await res.blob();
    await readPhoto(new File([blob], "sample-bill.png", { type: blob.type || "image/png" }));
  }

  async function readText() {
    setPreview(null);
    const fd = new FormData();
    fd.append("text", text);
    await send(fd);
  }

  const total = draft ? Number(draft.total) : 0;
  const validTotal = Number.isFinite(total) && total > 0;

  const options = useMemo(() => {
    if (!draft || !validTotal) return null;
    return buildRouteOptions({
      profile: {
        otherUnearnedIncome: circle.otherUnearnedIncome,
        countableResources: circle.countableResources,
        ableContributedThisYear: circle.ableContributedThisYear,
      },
      giftMonth,
      amount: total,
      expense: expenseKindFor(draft.category),
      hasAble: circle.hasAble,
      vendorName: draft.vendorName,
      firstName: first,
    });
  }, [draft, validTotal, total, circle, giftMonth, first]);

  const chosen: GiftRoute | null = options ? (route ?? recommendedRoute(options)) : null;
  const split = validTotal ? splitBill(total, members.map((m) => ({ id: m.id, monthlyCap: m.monthlyCap }))) : null;
  const lineSum = read ? read.invoice.lineItems.reduce((s, li) => s + Math.round(li.amount * 100), 0) / 100 : 0;
  const lineMismatch = read && validTotal && Math.abs(lineSum - total) > 0.01;

  function save() {
    if (!draft || !read || !chosen || chosen === "cash_to_recipient") return;
    startSaving(async () => {
      const result = await createBillAction({
        circleId: circle.id,
        vendorName: draft.vendorName,
        vendorPayPalEmail: draft.vendorPayPalEmail.trim() || null,
        invoiceNumber: draft.invoiceNumber.trim() || null,
        invoiceDate: draft.invoiceDate || null,
        dueDate: draft.dueDate || null,
        category: draft.category,
        total,
        lineItems: read.invoice.lineItems,
        route: chosen,
        extraction: {
          model: read.model,
          confidence: read.invoice.confidence,
          ms: read.ms,
          reasons: read.reasons,
          source: read.source,
        },
      });
      if (result?.error) setError(result.error);
    });
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <div className="mt-8 space-y-10">
      {/* 1. The bill */}
      <section aria-labelledby="step-1">
        <h2 id="step-1" className="font-serif text-xl font-semibold">
          <span className="text-ink-3">1.</span> The bill
        </h2>

        {stage === "review" && read ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <AiTag>AI read</AiTag>
            <CheckCircle2 className="size-4 text-safe" aria-hidden="true" />
            Read from the {read.source} in {(read.ms / 1000).toFixed(1)} s by {read.model}. Check the fields below.
            <button
              type="button"
              className="font-semibold text-action underline-offset-2 hover:underline"
              onClick={() => setStage("start")}
            >
              Use a different bill
            </button>
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-rule bg-surface p-5">
            {stage === "reading" ? (
              <div role="status" className="flex items-center gap-3 py-6 text-ink-2">
                <Loader2 className="size-5 animate-spin text-action" aria-hidden="true" />
                Reading the bill…
              </div>
            ) : typing ? (
              <div>
                <label htmlFor="bill-text" className={labelText}>
                  Type or paste what the bill says
                </label>
                <textarea
                  id="bill-text"
                  rows={7}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-rule-strong bg-surface p-3 text-base"
                  placeholder="Vendor, invoice number, due date, each charge and the total"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={buttonClass.primary}
                    disabled={text.trim().length < 10}
                    onClick={() => void readText()}
                  >
                    Read it
                  </button>
                  <button type="button" className={buttonClass.quiet} onClick={() => setTyping(false)}>
                    Use a photo instead
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <label className={`${buttonClass.primary} cursor-pointer`}>
                  <Camera className="size-4" aria-hidden="true" />
                  Take or upload a photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void readPhoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className={buttonClass.secondary} onClick={() => void readSample()}>
                  Use the sample repair bill
                </button>
                <button type="button" className={buttonClass.quiet} onClick={() => setTyping(true)}>
                  <FileText className="size-4" aria-hidden="true" />
                  Type it instead
                </button>
              </div>
            )}
          </div>
        )}

        {error ? (
          <div className="mt-3" role="alert">
            <Callout tone="cost" icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
              {error}
            </Callout>
          </div>
        ) : null}
      </section>

      {stage === "review" && draft && read ? (
        <>
          {/* 2. Check what was read */}
          <section aria-labelledby="step-2">
            <h2 id="step-2" className="font-serif text-xl font-semibold">
              <span className="text-ink-3">2.</span> Check what Countless read
            </h2>
            {read.needsReview || lineMismatch ? (
              <div className="mt-3">
                <Callout tone="warn" icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
                  <strong>Please check these before continuing.</strong>
                  <ul className="mt-1 list-disc pl-5">
                    {read.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                    {lineMismatch ? (
                      <li>
                        The charges add up to {usd(lineSum)}, but the total is {usd(total)}.
                      </li>
                    ) : null}
                  </ul>
                </Callout>
              </div>
            ) : null}

            <div className={`mt-4 grid gap-6 ${preview ? "md:grid-cols-[220px_minmax(0,1fr)]" : ""}`}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="The bill you added"
                  className="w-full rounded-lg border border-rule bg-surface object-contain md:max-h-80"
                />
              ) : null}
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelText}>Vendor</span>
                    <input className={field} value={draft.vendorName} onChange={set("vendorName")} />
                  </label>
                  <label className="block">
                    <span className={labelText}>Vendor&apos;s PayPal email</span>
                    <input
                      className={field}
                      type="email"
                      inputMode="email"
                      value={draft.vendorPayPalEmail}
                      onChange={set("vendorPayPalEmail")}
                      placeholder="Where the payment goes"
                    />
                  </label>
                  <label className="block">
                    <span className={labelText}>Invoice number</span>
                    <input className={field} value={draft.invoiceNumber} onChange={set("invoiceNumber")} />
                  </label>
                  <label className="block">
                    <span className={labelText}>Due date</span>
                    <input className={field} type="date" value={draft.dueDate} onChange={set("dueDate")} />
                  </label>
                  <label className="block">
                    <span className={labelText}>What it pays for</span>
                    <select className={field} value={draft.category} onChange={set("category")}>
                      {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelText}>Total due (USD)</span>
                    <input
                      className={`${field} tabular-nums`}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={draft.total}
                      onChange={set("total")}
                      aria-invalid={!validTotal}
                    />
                  </label>
                </div>

                {read.invoice.lineItems.length ? (
                  <table className="w-full text-sm">
                    <caption className="sr-only">Charges on the bill</caption>
                    <thead>
                      <tr className="border-b border-rule text-left text-ink-3">
                        <th scope="col" className="py-2 font-medium">
                          Charge
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {read.invoice.lineItems.map((li, i) => (
                        <tr key={i} className="border-b border-rule/70">
                          <td className="py-2 pr-4">{li.description}</td>
                          <td className="py-2 text-right tabular-nums">{usd(li.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" className="pt-2 text-left font-semibold">
                          Adds up to
                        </th>
                        <td className="pt-2 text-right font-semibold tabular-nums">{usd(lineSum)}</td>
                      </tr>
                    </tfoot>
                  </table>
                ) : null}
              </div>
            </div>
          </section>

          {/* 3. The meter */}
          <section aria-labelledby="step-3">
            <h2 id="step-3" className="font-serif text-xl font-semibold">
              <span className="text-ink-3">3.</span> What each way of paying does to {first}&apos;s SSI
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Income counts two months after it arrives, so these are {first}&apos;s next three checks.
            </p>
            <div className="mt-4">
              {options && chosen ? (
                <RouteMeter options={options} value={chosen} onChange={setRoute} firstName={first} />
              ) : (
                <Callout tone="warn">Enter a total above $0 to compare.</Callout>
              )}
            </div>
          </section>

          {/* 4. Who pays */}
          <section aria-labelledby="step-4">
            <h2 id="step-4" className="font-serif text-xl font-semibold">
              <span className="text-ink-3">4.</span> Who pays
            </h2>
            {split ? (
              <>
                <ul className="mt-4 divide-y divide-rule rounded-xl border border-rule bg-surface">
                  {split.shares.map((s) => {
                    const m = members.find((x) => x.id === s.memberId)!;
                    return (
                      <li key={s.memberId} className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.name}</span>
                          <span className="block text-sm text-ink-3">up to {usd(m.monthlyCap)} a month</span>
                        </span>
                        <span className="font-semibold tabular-nums">{usd(s.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
                {split.uncovered > 0 ? (
                  <div className="mt-3">
                    <Callout tone="warn">
                      The circle can cover {usd(split.covered)} this month. {usd(split.uncovered)} is left;
                      invite someone or raise a limit.
                    </Callout>
                  </div>
                ) : null}
                <p className="mt-3 text-sm text-ink-2">
                  Shares follow each person&apos;s monthly limit, to the cent. Nobody is charged until{" "}
                  {circle.organizerName.split(" ")[0]} approves the payment.
                </p>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={buttonClass.primary}
                disabled={saving || !validTotal || !draft.vendorName.trim() || chosen === "cash_to_recipient"}
                onClick={save}
              >
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Add bill to the circle
              </button>
              <span className="text-sm text-ink-3">You approve the payment on the next screen.</span>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
