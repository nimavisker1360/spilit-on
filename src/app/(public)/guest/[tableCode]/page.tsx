import { GuestExperience } from "@/components/guest-experience";

export default function GuestTablePage({
  params
}: {
  params: {
    tableCode: string;
  };
}) {
  return <GuestExperience tableCode={params.tableCode} />;
}
