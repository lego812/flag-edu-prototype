import { notFound } from "next/navigation";
import Link from "@/components/feedback-link";
import { createClient } from "@/lib/supabase/server";
import { invitationToken } from "@/features/auth/continuation";
import { AcceptInvitationForm } from "@/features/workspaces/accept-invitation-form";
import { logoutAction } from "@/features/auth/actions";
import { SubmitButton } from "@/components/submit-button";
import { isInvitationExpired } from "@/features/workspaces/invitation-expiration";

export const metadata = {
  title: "워크스페이스 초대",
  robots: { index: false, follow: false },
};
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = invitationToken((await params).token);
  if (!token) notFound();
  const next = `/invitations/${token}`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = user?.email_confirmed_at
    ? await supabase.rpc("get_workspace_invitation", { p_token: token })
    : { data: null };
  const invite = data?.[0];
  const expired =
    invite && !invite.accepted && isInvitationExpired(invite.expires_at);
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <p className="text-sm font-semibold">Flag Edu</p>
        <h1 className="mt-2 text-3xl font-bold">워크스페이스 초대</h1>
        {!user ? (
          <>
            <p className="mt-4 leading-7 text-neutral-600">
              초대받은 이메일로 로그인하거나 가입해 초대를 수락해 주세요.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="mt-6 block rounded-lg bg-black px-4 py-3 text-center font-semibold text-white"
            >
              로그인하고 수락하기
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(next)}`}
              className="mt-4 block py-3 text-center underline"
            >
              회원가입하고 수락하기
            </Link>
          </>
        ) : invite && !expired ? (
          <>
            <p className="mt-4 text-xl font-bold">{invite.workspace_name}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              {user.email} 계정으로 참여합니다. 수락하면 이 워크스페이스로
              이동합니다.
            </p>
            <AcceptInvitationForm token={token} />
          </>
        ) : (
          <>
            <p role="alert" className="mt-4 leading-7 text-neutral-600">
              {expired
                ? "초대가 만료되었습니다. 관리자에게 새 초대 메일을 요청해 주세요."
                : "이 계정으로 확인할 수 없는 초대입니다. 초대받은 이메일로 로그인했는지 확인하거나 관리자에게 새 초대를 요청해 주세요."}
            </p>
            <form action={logoutAction} className="mt-5">
              <SubmitButton
                className="min-h-11 text-sm underline"
                pendingLabel="로그아웃 중…"
              >
                로그아웃하고 다른 계정으로 로그인
              </SubmitButton>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
