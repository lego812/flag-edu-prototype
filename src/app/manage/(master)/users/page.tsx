import Link from "@/components/feedback-link";
import { requireMaster } from "@/features/master/access";
import {
  dateTime,
  queryParams,
  statusLabel,
  type Params,
  type UserDashboard,
} from "@/features/master/model";
import { Pagination, Search } from "@/features/master/navigation";
export const metadata = { title: "사용자 관리" };
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { supabase } = await requireMaster();
  const { q, page } = queryParams(await searchParams);
  const { data, error } = await supabase.rpc("master_users", {
    p_search: q,
    p_page: page,
  });
  if (error || !data)
    throw new Error("사용자 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
  const dashboard = data as UserDashboard;
  return (
    <>
      <h1 className="text-3xl font-bold">사용자 관리</h1>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["전체 사용자", dashboard.stats.total],
          ["최근 7일 가입", dashboard.stats.recent],
          ["활성 소속 없음", dashboard.stats.without_workspace],
        ].map(([label, value]) => (
          <div key={label} className="surface p-5">
            <dt className="text-sm text-neutral-600">{label}</dt>
            <dd className="mt-2 text-3xl font-bold">
              {value}
              <span className="ml-1 text-sm">명</span>
            </dd>
          </div>
        ))}
      </dl>
      <Search path="/manage/users" q={q} label="이름·이메일 검색" />
      <p className="text-sm text-neutral-500">
        최근 로그인은 인증 시각이며 마지막 앱 사용 시각과 다릅니다. 기존
        가입자의 동의 면제는 동의 완료와 구분합니다. 모든 시각은 한국
        시간입니다.
      </p>
      <ul className="space-y-4">
        {dashboard.items.map((u) => (
          <li key={u.id} className="surface min-w-0 space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="break-words text-lg font-bold">
                {u.name || "프로필 미등록"}
              </h2>
              <p className="mt-1 break-all text-sm text-neutral-600">
                {u.email || "이메일 없음"}
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">가입일</dt>
                <dd>{dateTime(u.created_at)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">최근 로그인</dt>
                <dd>{dateTime(u.last_sign_in_at)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-neutral-500">필수 가입 동의</dt>
                <dd>
                  {u.consent === "accepted"
                    ? `동의 완료 · ${u.policy_version} · ${dateTime(u.accepted_at)}`
                    : u.consent === "legacy_exempt"
                      ? "기존 가입자 · 동의 면제"
                      : "미완료"}
                </dd>
              </div>
            </dl>
            <div className="border-t border-neutral-100 pt-3">
              <h3 className="text-sm font-bold">소속 워크스페이스</h3>
              {u.memberships.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {u.memberships.map((w) => (
                    <li key={w.id} className="break-words">
                      <Link
                        href={`/manage/all-workspaces/${w.id}?section=members`}
                        className="underline"
                      >
                        {w.name}
                      </Link>{" "}
                      · {w.role === "admin" ? "관리자" : "코치"} ·{" "}
                      {statusLabel[w.status] ?? w.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">소속 없음</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!dashboard.items.length && (
        <p className="surface p-6">표시할 사용자가 없습니다.</p>
      )}
      <Pagination
        path="/manage/users"
        page={page}
        total={dashboard.total}
        query={{ q }}
      />
    </>
  );
}
