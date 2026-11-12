import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Callout, buttonClass } from "@/components/ui";
import { getCircle, getMember, getSetupTokenId, saveMemberVault } from "@/lib/data";
import { usd } from "@/lib/format";
import { finishSavePayPal } from "@/lib/paypal/countless";

export const metadata: Metadata = { title: "PayPal saved" };

/** PayPal sends the donor back here after they approve saving PayPal. */
export default function SavedPage(props: PageProps<"/join/[circleId]/saved">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Suspense fallback={<p role="status" className="text-ink-2">Saving your PayPal…</p>}>
        <Saved params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Saved({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { circleId } = await params;
  const { member: memberId } = await searchParams;
  const circle = await getCircle(circleId);
  if (!circle || typeof memberId !== "string") notFound();
  let member = await getMember(circleId, memberId);
  if (!member) notFound();

  if (!member.vaultTokenId) {
    const setupTokenId = await getSetupTokenId(member.id);
    if (!setupTokenId) {
      return <Callout tone="warn">This link has expired. Open the invite again to save PayPal.</Callout>;
    }
    try {
      const saved = await finishSavePayPal(setupTokenId);
      await saveMemberVault(member.id, saved.vaultTokenId, saved.paypalEmail);
      member = { ...member, vaultTokenId: saved.vaultTokenId, paypalEmail: saved.paypalEmail };
    } catch (err) {
      console.error("[join/saved]", (err as Error).message);
      return (
        <Callout tone="cost">
          PayPal didn&apos;t confirm. If you cancelled, nothing was saved.{" "}
          <Link href={`/join/${circle.id}`} className="font-semibold underline">
            Try again
          </Link>
        </Callout>
      );
    }
  }

  return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto size-10 text-safe" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight">You&apos;re in, {member.name.split(" ")[0]}</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-2">
        PayPal is saved{member.paypalEmail ? ` (${member.paypalEmail})` : ""}. Nothing has been charged. When a bill for{" "}
        {circle.recipientFirstName} is approved, you&apos;ll pay your share, never more than {usd(member.monthlyCap)} a month.
      </p>
      <Link href={`/c/${circle.id}`} className={`${buttonClass.secondary} mt-8`}>
        See {circle.recipientFirstName}&apos;s circle
      </Link>
    </div>
  );
}
