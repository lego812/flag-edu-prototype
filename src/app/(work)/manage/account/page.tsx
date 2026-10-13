import { requireCurrentProfile } from "@/features/auth/current-user";
import { LogoutButton } from "@/features/auth/logout-button";

export const metadata = { title: "계정 관리" };

export default async function AccountPage() {
  const { user, profile, workspace, workspaces } =
    await requireCurrentProfile();
  const providers = new Set(
    user.identities?.map((identity) => identity.provider),
  );
  const loginMethods =
    [
      providers.has("google") && "Google",
      providers.has("email") && "이메일·비밀번호",
    ]
      .filter(Boolean)
      .join(", ") || "확인할 수 없음";
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">계정 관리</h1>
      <section className="surface p-6">
        <h2 className="mb-5 text-lg font-bold">계정 정보</h2>
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">이름</dt>
            <dd className="mt-1 break-words">{profile.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">이메일</dt>
            <dd className="mt-1 break-all">
              {user.email ?? "등록된 이메일 없음"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">로그인 방식</dt>
            <dd className="mt-1">{loginMethods}</dd>
          </div>
        </dl>
      </section>
      <section className="surface p-6">
        <h2 className="mb-5 text-lg font-bold">참여 중인 워크스페이스</h2>
        <ul className="divide-y divide-neutral-100">
          {workspaces.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap justify-between gap-3 py-3 text-sm"
            >
              <span className="break-words">
                {item.name}
                {item.id === workspace.id && (
                  <span className="ml-2 text-xs text-neutral-500">현재</span>
                )}
              </span>
              <span>{item.role === "admin" ? "관리자" : "코치"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="surface p-6">
        <h2 className="mb-4 text-lg font-bold">로그아웃</h2>
        <LogoutButton />
      </section>
      <nav aria-label="서비스 안내" className="flex gap-5 text-sm">
        <a href="/terms" className="underline">
          이용약관
        </a>
        <a href="/privacy" className="underline">
          개인정보처리방침
        </a>
      </nav>
    </div>
  );
}
