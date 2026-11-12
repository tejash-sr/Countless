import type { ReactNode } from "react";

export type Tone = "safe" | "cost" | "warn" | "neutral" | "action";

const TONE: Record<Tone, string> = {
  safe: "bg-safe-soft text-safe",
  cost: "bg-cost-soft text-cost",
  warn: "bg-warn-soft text-warn",
  neutral: "bg-sunk text-ink-2",
  action: "bg-action-soft text-action-strong",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${BASE} bg-action text-white hover:bg-action-strong`,
  secondary: `${BASE} border border-rule-strong bg-surface text-ink hover:bg-sunk`,
  quiet: `${BASE} px-3 text-action hover:bg-action-soft`,
};

export function Callout({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  const border: Record<Tone, string> = {
    safe: "border-safe/30",
    cost: "border-cost/30",
    warn: "border-warn/30",
    neutral: "border-rule",
    action: "border-action/30",
  };
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${border[tone]} ${TONE[tone]}`}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}
