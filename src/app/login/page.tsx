import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "로그인" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold text-blue-600">Flag Edu</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          로그인
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          이미 비밀번호를 설정한 계정으로 로그인하세요.
        </p>
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
          처음 초대받았다면 이 화면에서 로그인하지 말고, 초대 이메일의
          <strong> 초대 수락</strong> 버튼을 눌러 사용할 비밀번호를 먼저
          설정하세요.
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
