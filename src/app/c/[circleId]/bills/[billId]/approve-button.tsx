"use client";

import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Callout, buttonClass } from "@/components/ui";
import { approveAndPayAction } from "./actions";

export function ApproveButton({ circleId, billId, label, disabled }: { circleId: string; billId: string; label: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        className={buttonClass.primary}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await approveAndPayAction(circleId, billId);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
        {pending ? "Paying…" : label}
      </button>
      {error ? (
        <div role="alert">
          <Callout tone="cost" icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
            {error}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
