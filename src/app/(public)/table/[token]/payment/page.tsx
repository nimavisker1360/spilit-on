import { notFound } from "next/navigation";

import { GuestPaymentEntry } from "@/components/guest-payment-entry";
import { resolveTableByPublicToken } from "@/features/table/table.service";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    token: string;
  };
  searchParams: {
    guestId?: string;
    handoff?: string;
  };
};

export default async function TableTokenPaymentEntryPage({ params, searchParams }: Props) {
  const token = params.token?.trim();

  if (!token) {
    notFound();
  }

  const table = await resolveTableByPublicToken(token);

  if (!table) {
    notFound();
  }

  return (
    <GuestPaymentEntry
      tableCode={table.code}
      initialGuestId={searchParams.guestId ?? ""}
      handoffMode={searchParams.handoff ?? ""}
    />
  );
}
