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
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            구성원 관리
          </h1>
          <p className="mt-3 text-slate-600">
            코치를 이메일로 초대하고 현재 구성원을 확인합니다.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-5 text-lg font-bold text-slate-950">코치 초대</h2>
          <InviteForm />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-bold text-slate-950">현재 구성원</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {members?.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <span className="font-medium text-slate-900">{member.name}</span>
                {(() => {
                  const authUser = authUserById.get(member.id);
                  const isInvitationPending =
                    Boolean(authUser) &&
                    authUser?.user_metadata?.must_change_password === true;

                  return (
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm ${
                          isInvitationPending
                            ? "font-medium text-amber-700"
                            : "text-slate-500"
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
