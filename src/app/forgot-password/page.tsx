import Link from "next/link";
import { RecoveryForm } from "@/features/auth/recovery-form";
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-5 py-16">
      <h1 className="text-2xl font-bold">비밀번호 재설정</h1>
      <p className="text-sm text-neutral-600">
        관리자가 초대한 이메일 주소를 입력하세요.
      </p>
      <RecoveryForm />
      <Link href="/login" className="inline-block text-sm underline">
        로그인으로 돌아가기
      </Link>
    </main>
  );
}
