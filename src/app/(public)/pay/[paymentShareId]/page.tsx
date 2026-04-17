import { GuestShell } from "@/components/layout/guest-shell";

import { MockPaymentExperience } from "./payment-experience";

type Props = {
  params: {
    paymentShareId: string;
  };
  searchParams: {
    token?: string;
  };
};

export default function MockPaymentPage({ params, searchParams }: Props) {
  return (
    <GuestShell>
      <MockPaymentExperience paymentShareId={params.paymentShareId} token={searchParams.token ?? ""} />
    </GuestShell>
  );
}
