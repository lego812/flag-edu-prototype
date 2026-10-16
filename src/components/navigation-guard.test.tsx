import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  NavigationGuardProvider,
  GuardedNavigationForm,
  useNavigationGuard,
} from "./navigation-guard";
import FeedbackLink from "./feedback-link";
import { BackButton } from "./back-button";
import { ReportEditor } from "@/features/reports/editor";
import { InquiryForm } from "@/features/support/form";
vi.mock("@/features/support/actions", () => ({ saveInquiryAction: vi.fn() }));
import type { Report, Field } from "@/features/reports/model";
const m = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  back: vi.fn(),
}));
const router = { push: m.push, replace: m.replace, back: m.back };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    onClick,
    onNavigate,
    href,
    children,
    ...props
  }: {
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    onNavigate?: (event: { preventDefault: () => void }) => void;
    href: string;
    children: React.ReactNode;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        let blocked = false;
        onNavigate?.({
          preventDefault: () => {
            blocked = true;
          },
        });
        if (!blocked) m.push(href);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/features/reports/actions", () => ({ saveReportAction: m.save }));
function Leave({ proceed }: { proceed: () => void }) {
  const { requestNavigation } = useNavigationGuard();
  return (
    <button
      onClick={() => {
        if (requestNavigation(proceed)) proceed();
      }}
    >
      다른 화면
    </button>
  );
}
function Dirty() {
  const { register } = useNavigationGuard();
  useEffect(() => register(() => ({ dirty: true, busy: false })), [register]);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
const report = {
  id: "report",
  updated_at: "version",
  report_answers: [],
  class_sessions: { status: "scheduled" },
} as unknown as Report;
const field = {
  id: "answer",
  label: "보고서 내용",
  field_type: "short_text",
  required: false,
  help_text: null,
  sort_order: 1,
  settings: {},
  field_options: [],
} as Field;
it("preserves edits on cancellation and leaves only after explicit confirmation", () => {
  const proceed = vi.fn();
  render(
    <NavigationGuardProvider>
      <ReportEditor report={report} fields={[field]} />
      <Leave proceed={proceed} />
    </NavigationGuardProvider>,
  );
  fireEvent.change(screen.getByLabelText("보고서 내용"), {
    target: { value: "미저장 답변" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  expect(proceed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
  expect(screen.getByLabelText("보고서 내용")).toHaveValue("미저장 답변");
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 이동" }));
  expect(proceed).toHaveBeenCalledTimes(1);
  expect(m.save).not.toHaveBeenCalled();
});
it("protects failed saves but needs no confirmation after successful save", async () => {
  const proceed = vi.fn();
  m.save.mockResolvedValue({ error: "저장 실패" });
  render(
    <NavigationGuardProvider>
      <ReportEditor report={report} fields={[field]} />
      <Leave proceed={proceed} />
    </NavigationGuardProvider>,
  );
  fireEvent.change(screen.getByLabelText("보고서 내용"), {
    target: { value: "답변" },
  });
  fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "임시저장" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  expect(proceed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
  m.save.mockResolvedValue({ success: "저장 완료" });
  fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
  await screen.findByText("저장 완료");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "임시저장" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  expect(proceed).toHaveBeenCalledTimes(1);
});
it("blocks leaving during an in-flight save", async () => {
  let finish!: (v: { success: string }) => void;
  m.save.mockReturnValue(
    new Promise((r) => {
      finish = r;
    }),
  );
  const proceed = vi.fn();
  render(
    <NavigationGuardProvider>
      <ReportEditor report={report} fields={[field]} />
      <Leave proceed={proceed} />
    </NavigationGuardProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
  await waitFor(() => expect(m.save).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("저장이 진행 중");
  expect(
    screen.queryByRole("button", { name: "저장하지 않고 이동" }),
  ).not.toBeInTheDocument();
  expect(proceed).not.toHaveBeenCalled();
  finish({ success: "저장 완료" });
  await screen.findByText("저장 완료");
});
it("does not switch workspace before confirmation and preserves the submitter", async () => {
  const action = vi.fn().mockResolvedValue(undefined);
  render(
    <NavigationGuardProvider>
      <Dirty />
      <GuardedNavigationForm action={action}>
        <button name="workspaceId" value="target">
          전환
        </button>
      </GuardedNavigationForm>
    </NavigationGuardProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "전환" }));
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "전환" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 이동" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(action.mock.calls[0][0].get("workspaceId")).toBe("target");
});

it("guards menu links and the app back button with the same confirmation", () => {
  render(
    <NavigationGuardProvider>
      <Dirty />
      <FeedbackLink href="/manage">관리</FeedbackLink>
      <BackButton />
    </NavigationGuardProvider>,
  );
  fireEvent.click(screen.getByRole("link", { name: "관리" }));
  expect(m.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
  fireEvent.click(screen.getByRole("link", { name: "관리" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 이동" }));
  expect(m.push).toHaveBeenCalledWith("/manage", { scroll: undefined });
  m.push.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "뒤로가기" }));
  expect(m.back).not.toHaveBeenCalled();
  expect(m.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
});

it("protects unsaved support inquiries with inquiry-specific confirmation", () => {
  const proceed = vi.fn();
  render(
    <NavigationGuardProvider>
      <InquiryForm id="20000000-0000-4000-8000-000000000100" />
      <Leave proceed={proceed} />
    </NavigationGuardProvider>,
  );
  fireEvent.change(screen.getByLabelText(/내용/), {
    target: { value: "작성 중인 문의" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  expect(
    screen.getByRole("dialog", { name: "문의글 이동 확인" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/저장하지 않은 문의글 내용/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
  expect(screen.getByLabelText(/내용/)).toHaveValue("작성 중인 문의");
  expect(proceed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 이동" }));
  expect(proceed).toHaveBeenCalledTimes(1);
});
