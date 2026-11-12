"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Callout, buttonClass } from "@/components/ui";
import { joinAction } from "./actions";

const field =
  "mt-1 block h-11 w-full rounded-lg border border-rule-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-action";

export function JoinForm({
  circleId,
  invited,
}: {
  circleId: string;
  invited: { id: string; name: string; relationship: string; monthlyCap: number }[];
}) {
  const [state, action, pending] = useActionState(joinAction, null);
  const [who, setWho] = useState(invited[0]?.id ?? "new");
  const suggested = invited.find((m) => m.id === who)?.monthlyCap ?? 50;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="circleId" value={circleId} />

      <fieldset>
        <legend className="font-semibold">Who are you?</legend>
        <div className="mt-3 divide-y divide-rule rounded-xl border border-rule bg-surface">
          {invited.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="radio"
                name="memberId"
                value={m.id}
                checked={who === m.id}
                onChange={() => setWho(m.id)}
                className="size-4 accent-[var(--color-action)]"
              />
              <span className="min-w-0">
                <span className="block font-medium">{m.name}</span>
                <span className="block text-sm text-ink-3">{m.relationship}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
            <input
              type="radio"
              name="memberId"
              value="new"
              checked={who === "new"}
              onChange={() => setWho("new")}
              className="size-4 accent-[var(--color-action)]"
            />
            <span className="font-medium">Someone new</span>
          </label>
        </div>
      </fieldset>

      {who === "new" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-ink-2">Your name</span>
            <input name="name" required minLength={2} maxLength={80} autoComplete="name" className={field} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-2">How you know them</span>
            <input name="relationship" required minLength={2} maxLength={60} placeholder="Cousin, neighbor…" className={field} />
          </label>
        </div>
      ) : null}

      <label className="block max-w-xs">
        <span className="text-sm font-medium text-ink-2">Most you&apos;ll give in a month (USD)</span>
        <input
          key={who}
          name="monthlyCap"
          type="number"
          inputMode="decimal"
          min={5}
          max={2000}
          step={5}
          defaultValue={suggested}
          required
          className={`${field} tabular-nums`}
        />
        <span className="mt-1 block text-sm text-ink-3">You&apos;re never charged more than this in a month.</span>
      </label>

      {state?.error ? (
        <div role="alert">
          <Callout tone="cost" icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
            {state.error}
          </Callout>
        </div>
      ) : null}

      <button type="submit" className={buttonClass.primary} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Continue to PayPal
      </button>
    </form>
  );
}
