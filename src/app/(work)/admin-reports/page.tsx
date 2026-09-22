import { ReportList } from "@/features/reports/list";
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReportList params={await searchParams} admin />;
}
