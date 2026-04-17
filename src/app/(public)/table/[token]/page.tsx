import { notFound } from "next/navigation";

import { GuestExperience } from "@/components/guest-experience";
import { resolveTableByPublicToken } from "@/features/table/table.service";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    token: string;
  };
};

export default async function TableTokenPage({ params }: Props) {
  const token = params.token?.trim();

  if (!token) {
    notFound();
  }

  const table = await resolveTableByPublicToken(token);

  if (!table) {
    notFound();
  }

  return <GuestExperience tableCode={table.code} />;
}
