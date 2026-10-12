"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function GoogleLogin() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function login() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?flow=google`,
        },
      });
      if (error) throw error;
    } catch {
      setError(
        "Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={login}
        className="min-h-12 w-full rounded-lg border border-neutral-300 bg-white px-5 py-3 font-semibold disabled:opacity-60"
      >
        {pending ? "Google로 이동 중…" : "Google로 가입·로그인"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
