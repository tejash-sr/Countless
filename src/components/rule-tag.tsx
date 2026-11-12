import { RULES, type RuleId } from "@/lib/ssi/rules";

/** A footnote-style link to the official rule behind a decision. */
export function RuleTag({ id }: { id: RuleId }) {
  const rule = RULES[id];
  return (
    <a
      href={rule.url}
      target="_blank"
      rel="noreferrer"
      title={rule.title}
      aria-label={`${rule.code}: ${rule.title}. Official source, opens in a new tab.`}
      className="inline-flex items-center rounded border border-rule-strong bg-surface px-1.5 py-1 font-mono text-[11px] leading-none text-ink-2 transition-colors hover:border-action hover:text-action"
    >
      {rule.code}
    </a>
  );
}
