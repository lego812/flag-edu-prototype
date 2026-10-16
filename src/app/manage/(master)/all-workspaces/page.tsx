import Link from "@/components/feedback-link";
import { requireMaster } from "@/features/master/access";
import {
  dateTime,
  queryParams,
  type Params,
  type Workspace,
} from "@/features/master/model";
import { Pagination, Search } from "@/features/master/navigation";
export const metadata = { title: "전체 워크스페이스" };
export default async function AllWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { supabase } = await requireMaster();
  const { q, page } = queryParams(await searchParams);
  const { data, error } = await supabase.rpc("master_workspaces", {
    p_search: q,
    p_page: page,
  });
  if (error || !data)
    throw new Error("워크스페이스를 불러오지 못했습니다. 다시 시도해 주세요.");
  const result = data as { total: number; items: Workspace[] };
  return (
    <>
      <h1 className="text-3xl font-bold">전체 워크스페이스</h1>
      <p className="text-sm text-neutral-600">
        소속 여부와 관계없이 조회할 수 있습니다. 삭제된 워크스페이스는 표시하지
        않습니다.
      </p>
      <Search
        path="/manage/all-workspaces"
        q={q}
        label="워크스페이스 이름 검색"
      />
      <ul className="space-y-3">
        {result.items.map((w) => (
          <li key={w.id}>
            <Link
              href={`/manage/all-workspaces/${w.id}`}
              className="surface block p-6"
            >
              <h2 className="break-words font-bold">{w.name}</h2>
              <p className="mt-2 text-sm text-neutral-500">
                생성일 {dateTime(w.created_at, false)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {!result.items.length && (
        <p className="surface p-6">표시할 워크스페이스가 없습니다.</p>
      )}
      <Pagination
        path="/manage/all-workspaces"
        page={page}
        total={result.total}
        query={{ q }}
      />
    </>
  );
}
