import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Callout } from "@/components/ui";
import { getCircle, listMembers } from "@/lib/data";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join the circle" };

export default function JoinPage(props: PageProps<"/join/[circleId]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-sunk" aria-busy="true" />}>
        <Join params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Join({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { circleId } = await params;
  const query = await searchParams;
  const circle = await getCircle(circleId);
  if (!circle) notFound();
  const invited = (await listMembers(circleId))
    .filter((m) => !m.vaultTokenId)
    .map(({ id, name, relationship, monthlyCap }) => ({ id, name, relationship, monthlyCap }));
  const first = circle.recipientFirstName;

  return (
    <>
      <p className="text-sm font-medium text-ink-3">{circle.organizerName} invited you</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        Help with {first}&apos;s bills without cutting her SSI
      </h1>
      <p className="mt-3 text-ink-2">
        Cash gifts can lower {first}&apos;s SSI check. In this circle, bills are paid straight to the vendor, so her
        benefits stay whole.
      </p>

      <ol className="mt-6 space-y-2 border-y border-rule py-4 text-sm text-ink-2">
        <li>
          <span className="font-semibold text-ink">1. Save PayPal once.</span> No money moves today.
        </li>
        <li>
          <span className="font-semibold text-ink">2. When a bill comes in,</span> {circle.organizerName.split(" ")[0]}{" "}
          reviews it and approves the payment.
        </li>
        <li>
          <span className="font-semibold text-ink">3. You&apos;re charged your share,</span> never more than your monthly
          limit, and the vendor is paid the same day.
        </li>
      </ol>

      {query.cancelled ? (
        <div className="mt-6" role="status">
          <Callout tone="warn">PayPal wasn&apos;t saved. You can try again whenever you&apos;re ready.</Callout>
        </div>
      ) : null}

      <div className="mt-8">
        <JoinForm circleId={circle.id} invited={invited} />
      </div>
    </>
  );
}
