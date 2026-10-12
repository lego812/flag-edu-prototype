import type { ReactNode } from "react";
import Link from "@/components/feedback-link";
import { SIGNUP_POLICY_VERSION } from "./legal-policy";

export function LegalDocument({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12 text-sm leading-7">
      <header>
        <p className="font-semibold">Flag Edu</p>
        <h1 className="mt-3 text-3xl font-bold">{title}</h1>
        <p className="mt-3 text-neutral-600">시행일: {SIGNUP_POLICY_VERSION}</p>
      </header>
      {children}
      <nav
        aria-label="서비스 안내"
        className="flex flex-wrap gap-5 border-t pt-6"
      >
        <Link href="/login" className="underline">
          로그인
        </Link>
        <Link href="/terms" className="underline">
          이용약관
        </Link>
        <Link href="/privacy" className="underline">
          개인정보처리방침
        </Link>
      </nav>
    </main>
  );
}
