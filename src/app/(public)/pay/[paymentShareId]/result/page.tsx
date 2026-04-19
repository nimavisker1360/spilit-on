import { GuestShell } from "@/components/layout/guest-shell";

import { IyzicoPaymentResult } from "./iyzico-payment-result";

type Props = {
  params: {
    paymentShareId: string;
  };
  searchParams: {
    status?: string;
    error?: string;
  };
};

export default function PaymentResultPage({ params, searchParams }: Props) {
  return (
    <GuestShell>
      <IyzicoPaymentResult
        paymentShareId={params.paymentShareId}
        initialStatus={searchParams.status ?? ""}
        initialError={searchParams.error ?? ""}
      />
    </GuestShell>
  );
}
