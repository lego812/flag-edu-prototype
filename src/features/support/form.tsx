"use client";
import {
  startTransition,
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/feedback-link";
import { SubmitButton } from "@/components/submit-button";
import { useNavigationGuard } from "@/components/navigation-guard";
import { saveInquiryAction } from "./actions";
import type { InquiryState } from "./model";
export function InquiryForm({
  id,
  title: initialTitle = "",
  body: initialBody = "",
  version = "",
}: {
  id: string;
  title?: string;
  body?: string;
  version?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const busy = useRef(false);
  const [state, action, pending] = useActionState(
    async (previous: InquiryState, data: FormData) => {
      try {
        return await saveInquiryAction(previous, data);
      } catch {
        return {
          error:
            "서버 응답을 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.",
        };
      } finally {
        busy.current = false;
      }
    },
    {},
  );
  const dirty =
    !state.savedId && (title !== initialTitle || body !== initialBody);
  const { register } = useNavigationGuard();
  useLayoutEffect(
    () => register(() => ({ dirty, busy: pending, label: "문의글" })),
    [register, dirty, pending],
  );
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty || pending) event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, pending]);
  useEffect(() => {
    if (state.savedId) router.replace(`/manage/support/${state.savedId}`);
  }, [state.savedId, router]);
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy.current || state.savedId) return;
        busy.current = true;
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <fieldset disabled={pending || !!state.savedId} className="space-y-5">
        <legend className="sr-only">문의글 작성</legend>
        <label className="block text-sm font-medium">
          제목
          <input
            name="title"
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            100자 이내
          </span>
        </label>
        <label className="block text-sm font-medium">
          내용
          <textarea
            name="body"
            required
            maxLength={5000}
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 leading-7"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            5,000자 이내
          </span>
        </label>
        <p className="text-sm text-neutral-600">
          문의글은 본인과 운영자(master)만 볼 수 있습니다. 비밀번호 등 민감한
          정보는 입력하지 마세요.
        </p>
        <SubmitButton pending={pending} pendingLabel="저장 중…" className="btn">
          {version ? "수정 저장" : "문의 등록"}
        </SubmitButton>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.savedId && (
        <p role="status" className="text-sm">
          저장했습니다.{" "}
          <Link href={`/manage/support/${state.savedId}`} className="underline">
            문의글 보기
          </Link>
        </p>
      )}
    </form>
  );
}
