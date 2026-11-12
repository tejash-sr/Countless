import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCircle, listMembers } from "@/lib/data";
import { currentMonth } from "@/lib/format";
import { BillFlow } from "./bill-flow";

export const metadata: Metadata = { title: "Add a bill" };

export default function NewBillPage(props: PageProps<"/c/[circleId]/bills/new">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-sunk" aria-busy="true" />}>
        <NewBill params={props.params} />
      </Suspense>
    </div>
  );
}

async function NewBill({ params }: { params: Promise<{ circleId: string }> }) {
  await connection();
  const { circleId } = await params;
  const circle = await getCircle(circleId);
  if (!circle) notFound();
  const members = await listMembers(circleId);

  return (
    <>
      <Link
        href={`/c/${circle.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-action hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {circle.recipientFirstName}&apos;s circle
      </Link>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Add a bill</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Countless reads the bill, shows what each way of paying does to {circle.recipientFirstName}&apos;s SSI,
        and splits it across the circle.
      </p>
      <BillFlow circle={circle} members={members} giftMonth={currentMonth()} />
    </>
  );
}
