import { GuestPaymentEntry } from "@/components/guest-payment-entry";

type Props = {
  params: {
    tableCode: string;
  };
  searchParams: {
    guestId?: string;
  };
};

export default function GuestPaymentEntryPage({ params, searchParams }: Props) {
  return (
    <GuestPaymentEntry
      tableCode={params.tableCode}
      initialGuestId={searchParams.guestId ?? ""}
      backHref={`/guest/${encodeURIComponent(params.tableCode)}`}
    />
  );
}
