"use client";

import Link from "@/components/feedback-link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeAuthNext, tokenFromNext } from "@/features/auth/continuation";
import { finishInvitationAuthentication } from "@/features/workspaces/invitation-actions";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function finishAuthentication() {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const next = safeAuthNext(query.get("next"), "/set-password");
      window.history.replaceState(null, "", window.location.pathname);
      const authError =
        hash.get("error_description") ?? query.get("error_description");

      if (authError) {
        setError(
          authError.toLowerCase().includes("expired")
            ? "인증 링크가 만료되었거나 이미 사용되었습니다. 가입 인증코드를 다시 받거나 새 초대 메일을 요청해 주세요."
            : "인증 링크를 확인할 수 없습니다. 새 인증 메일을 요청해 주세요.",
        );
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = query.get("code");
      let authenticationError: Error | null = null;

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authenticationError = sessionError;
      } else if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        authenticationError = exchangeError;
      } else {
        authenticationError = new Error("No invitation credentials");
      }

      if (authenticationError) {
        setError(
          "이메일 인증을 완료하지 못했습니다. 새 인증 메일을 요청해 주세요.",
        );
        return;
      }

      window.history.replaceState(null, "", window.location.pathname);
      const token = tokenFromNext(next);
      if (token) {
        const result = await finishInvitationAuthentication(token);
        if (result.error || !result.next) {
          setError(result.error ?? "초대를 수락하지 못했습니다.");
          return;
        }
        router.replace(result.next);
      } else {
        router.replace(next);
      }
      router.refresh();
    }

    void finishAuthentication().catch(() => {
      setError(
        "인증 서버에 연결하지 못했습니다. 잠시 후 새 초대 링크로 다시 시도해 주세요.",
      );
    });
  }, [router, supabase]);

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 text-center sm:p-9">
        {error ? (
          <>
            <p className="text-sm font-semibold text-red-600">
              이메일 인증 확인 실패
            </p>
            <h1 className="mt-2 text-2xl font-bold text-neutral-950">
              인증 링크를 확인해 주세요
            </h1>
            <p className="mt-4 leading-7 text-neutral-600" role="alert">
              {error}
            </p>
            <Link
              href="/login"
              className="mt-7 inline-flex rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              로그인 화면으로
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-black">Flag Edu</p>
            <h1 className="mt-2 text-2xl font-bold text-neutral-950">
              이메일 인증을 확인하고 있습니다
            </h1>
            <p className="mt-4 text-neutral-600">잠시만 기다려 주세요.</p>
          </>
        )}
      </section>
    </main>
  );
}
