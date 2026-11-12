"use client";

import { AlertTriangle, Loader2, ScanSearch } from "lucide-react";
import { useState, useTransition } from "react";
import { Callout, buttonClass } from "@/components/ui";
import { checkWithPayPalAction } from "./actions";

export function CheckButton({ circleId, billId, again }: { circleId: string; billId: string; again?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        className={again ? buttonClass.quiet : buttonClass.secondary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await checkWithPayPalAction(circleId, billId);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="size-4" aria-hidden="true" />}
        {pending ? "Agent is checking PayPal…" : again ? "Check again" : "Check every payment with PayPal"}
      </button>
      {error ? (
        <div role="alert">
          <Callout tone="warn" icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
            {error}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
