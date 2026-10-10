"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  signupAction,
  verifySignupAction,
  resendSignupAction,
  type SignupState,
} from "./signup-actions";

const inputClass =
  "mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-black focus:ring-2 focus:ring-neutral-200";
const buttonClass =
  "w-full rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-60";
function Result({ state }: { state: SignupState }) {
  return (
    <>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-neutral-600">
          {state.success}
        </p>
      )}
    </>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signupAction, {});
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const bind = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((previous) => ({ ...previous, [name]: event.target.value })),
  });
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-sm font-semibold">이름</span>
        <input
          {...bind("name")}
          name="name"
          autoComplete="name"
          required
          maxLength={50}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">이메일</span>
        <input
          {...bind("email")}
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">비밀번호</span>
        <input
          {...bind("password")}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">비밀번호 확인</span>
        <input
          {...bind("passwordConfirm")}
          type="password"
          name="passwordConfirm"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </label>
      <Result state={state} />
      <SubmitButton
        pending={pending}
        pendingLabel="인증 메일 발송 중…"
        className={buttonClass}
      >
        인증코드 받기
      </SubmitButton>
    </form>
  );
}

export function VerifySignupForm({
  email,
  next,
}: {
  email: string;
  next: string;
}) {
  const [state, action, pending] = useActionState(verifySignupAction, {});
  const [resendState, resend, resending] = useActionState(
    resendSignupAction,
    {},
  );
  const [recipient, setRecipient] = useState(email);
  const [code, setCode] = useState("");
  return (
    <div className="mt-8 space-y-5">
      <form action={action} className="space-y-5">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-sm font-semibold">이메일</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            required
            maxLength={254}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">6자리 인증코드</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className={inputClass}
          />
        </label>
        <Result state={state} />
        <SubmitButton
          pending={pending || resending}
          pendingLabel="인증 중…"
          className={buttonClass}
        >
          인증하고 가입 완료
        </SubmitButton>
      </form>
      <form action={resend} className="space-y-3">
        <input type="hidden" name="email" value={recipient} />
        <input type="hidden" name="next" value={next} />
        <SubmitButton
          pending={pending || resending}
          pendingLabel="재발송 중…"
          className="min-h-11 text-sm underline"
        >
          인증코드 다시 받기
        </SubmitButton>
        <Result state={resendState} />
      </form>
    </div>
  );
}
