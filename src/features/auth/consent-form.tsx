"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { acceptSignupConsentAction } from "./consent-action";
import { SIGNUP_POLICY_PUBLISHED, SIGNUP_POLICY_VERSION } from "./legal-policy";

export function SignupConsentForm() {
  const busy = useRef(false);
  const [state, action, pending] = useActionState(
    async (previous: { error?: string }, data: FormData) => {
      try {
        return await acceptSignupConsentAction(previous, data);
      } finally {
        busy.current = false;
      }
    },
    {},
  );
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (busy.current || !terms || !privacy || !SIGNUP_POLICY_PUBLISHED)
          return;
        const data = new FormData(event.currentTarget);
        busy.current = true;
        startTransition(() => action(data));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="policyVersion" value={SIGNUP_POLICY_VERSION} />
      <fieldset disabled={pending} className="space-y-5">
        <legend className="sr-only">회원가입 필수 동의</legend>
        <div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="terms"
              value="yes"
              required
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="size-5 accent-black"
            />
            <span>[필수] 이용약관 동의</span>
          </label>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-8 text-sm underline"
          >
            이용약관 보기 (새 창)
          </a>
        </div>
        <div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="privacy"
              value="yes"
              required
              checked={privacy}
              onChange={(event) => setPrivacy(event.target.checked)}
              className="size-5 accent-black"
            />
            <span>[필수] 개인정보 수집·이용 동의</span>
          </label>
          <a
            href="/privacy#signup-consent"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-8 text-sm underline"
          >
            수집·이용 내용 보기 (새 창)
          </a>
        </div>
      </fieldset>
      <p className="text-sm leading-6 text-neutral-600">
        필수 항목에 동의하지 않으면 회원가입을 완료할 수 없습니다.
      </p>
      {!SIGNUP_POLICY_PUBLISHED && (
        <p role="status" className="text-sm">
          가입 안내를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.
        </p>
      )}
      <SubmitButton
        disabled={!terms || !privacy || !SIGNUP_POLICY_PUBLISHED}
        pending={pending}
        pendingLabel="가입 완료 중…"
        className="btn-primary w-full"
      >
        동의하고 가입 완료
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
