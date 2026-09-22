import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { InviteForm } from "@/features/members/invite-form";
import { ResendInviteButton } from "@/features/members/resend-invite-button";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "구성원 관리" };

export default async function MembersPage() {
  const { supabase, profile } = await requireCurrentProfile();

  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, role, status, created_at")
    .order("created_at", { ascending: true });
  const adminClient = createAdminClient();
  const { data: authUsers } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const authUserById = new Map(
    authUsers?.users.map((user) => [user.id, user]) ?? [],
  );

  return (
    <div className="min-h-svh">
      <AppHeader name={profile.name} isAdmin />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <section>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950">
            구성원 관리
          </h1>
          <p className="mt-3 text-neutral-600">
            코치를 이메일로 초대하고 현재 구성원을 확인합니다.
          </p>
        </section>

        <section className="border-y border-neutral-200 py-6">
          <h2 className="mb-5 text-lg font-bold text-neutral-950">코치 초대</h2>
          <InviteForm />
        </section>

        <section>
          <div className="border-b border-neutral-200 py-4">
            <h2 className="font-bold text-neutral-950">현재 구성원</h2>
          </div>
          <ul className="divide-y divide-neutral-100">
            {members?.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <span className="min-w-0 break-words font-medium text-neutral-900">{member.name}</span>
                {(() => {
                  const authUser = authUserById.get(member.id);
                  const isInvitationPending =
                    Boolean(authUser) &&
                    authUser?.user_metadata?.must_change_password === true;

                  return (
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`text-sm ${
                          isInvitationPending
                            ? "rounded px-2 py-1 font-medium bg-accent text-black"
                            : "text-neutral-500"
                        }`}
                      >
                        {member.role === "admin" ? "관리자" : "코치"} ·{" "}
                        {!authUser
                          ? "가입 상태 확인 불가"
                          : isInvitationPending
                          ? "초대 수락 대기중"
                          : member.status === "active"
                            ? "활성"
                            : "비활성"}
                      </span>
                      {isInvitationPending && (
                        <ResendInviteButton userId={member.id} />
                      )}
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
