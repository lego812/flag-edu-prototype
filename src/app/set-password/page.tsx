import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "비밀번호 설정" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <p className="text-sm font-semibold text-black">초대 계정 설정</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">
          비밀번호를 만들어 주세요
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          8자 이상의 비밀번호를 설정하면 가입이 완료됩니다.
        </p>
        <SetPasswordForm email={user.email ?? ""} />
      </section>
    </main>
  );
}
