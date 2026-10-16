import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), get: vi.fn(), save: vi.fn(), replace: vi.fn() }));
vi.mock("@/features/master/access", () => ({ masterAccount: m.account }));
vi.mock("@/features/support/repository", () => ({ getInquiry: m.get }));
vi.mock("@/features/support/actions", () => ({ saveInquiryAction: m.save }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ replace: m.replace }),
  usePathname: () => "/manage/support",
}));
import SupportPage from "@/app/manage/support/page";
import InquiryPage from "@/app/manage/support/[id]/page";
import EditPage from "@/app/manage/support/[id]/edit/page";
import NewPage from "@/app/manage/support/new/page";
const id = "20000000-0000-4000-8000-000000000100";
const inquiry = {
  id,
  author_id: "own",
  title: "문의 제목",
  body: "문의 내용\n둘째 줄",
  created_at: "2026-10-16T00:00:00Z",
  updated_at: "2026-10-16T01:00:00Z",
  author_name: "코치",
  author_email: "coach@example.test",
};
beforeEach(() => {
  vi.clearAllMocks();
  m.account.mockResolvedValue({
    supabase: { rpc: m.rpc },
    isMaster: false,
    user: { id: "own" },
  });
  m.get.mockResolvedValue({ inquiry, isMaster: false, user: { id: "own" } });
  m.rpc.mockResolvedValue({ data: { total: 1, items: [inquiry] } });
});
afterEach(cleanup);
it("shows my inquiries and registration for a regular account", async () => {
  render(await SupportPage({ searchParams: Promise.resolve({}) }));
  expect(
    screen.getByRole("heading", { name: "내가 쓴 문의글" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "문의 등록" })).toHaveAttribute(
    "href",
    "/manage/support/new",
  );
  expect(
    screen.queryByText("coach@example.test", { exact: false }),
  ).not.toBeInTheDocument();
  expect(m.rpc).toHaveBeenCalledWith("list_support_inquiries", { p_page: 1 });
});
it("shows all inquiries with authors for master and hides write controls", async () => {
  m.account.mockResolvedValue({ supabase: { rpc: m.rpc }, isMaster: true });
  render(await SupportPage({ searchParams: Promise.resolve({ page: "2" }) }));
  expect(
    screen.getByRole("heading", { name: "전체 문의글" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/coach@example.test/)).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "문의 등록" }),
  ).not.toBeInTheDocument();
  await expect(NewPage()).rejects.toThrow("NOT_FOUND");
  m.get.mockResolvedValue({ inquiry, isMaster: true, user: { id: "master" } });
  await expect(EditPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "NOT_FOUND",
  );
});
it("allows only the owner to enter the editor, with existing content and version", async () => {
  render(await EditPage({ params: Promise.resolve({ id }) }));
  expect(screen.getByLabelText(/제목/)).toHaveValue(inquiry.title);
  expect(screen.getByLabelText(/내용/)).toHaveValue(inquiry.body);
  expect(document.querySelector("input[name=version]")).toHaveValue(
    inquiry.updated_at,
  );
  m.get.mockResolvedValue({ inquiry, isMaster: false, user: { id: "peer" } });
  await expect(EditPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "NOT_FOUND",
  );
});
it("renders plain text and never shows master edit controls", async () => {
  m.get.mockResolvedValue({
    inquiry: { ...inquiry, body: "<script>alert(1)</script>" },
    isMaster: true,
    user: { id: "master" },
  });
  const { container } = render(
    await InquiryPage({ params: Promise.resolve({ id }) }),
  );
  expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("link", { name: "편집" })).not.toBeInTheDocument();
});
it("separates empty results from a load failure", async () => {
  m.rpc.mockResolvedValue({ data: { total: 0, items: [] } });
  render(await SupportPage({ searchParams: Promise.resolve({ page: "-1" }) }));
  expect(
    screen.getByText("아직 작성한 문의글이 없습니다."),
  ).toBeInTheDocument();
  m.rpc.mockResolvedValue({ error: { message: "private failure" } });
  await expect(
    SupportPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("문의글 목록을 불러오지 못했습니다");
});

it("keeps the pending save result when revalidation supplies the updated inquiry", async () => {
  let finish!: (result: { savedId: string }) => void;
  m.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(await EditPage({ params: Promise.resolve({ id }) }));
  fireEvent.change(screen.getByLabelText(/내용/), { target: { value: "수정한 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  m.get.mockResolvedValue({ inquiry: { ...inquiry, body: "수정한 내용", updated_at: "2026-10-16T02:00:00Z" }, isMaster: false, user: { id: "own" } });
  view.rerender(await EditPage({ params: Promise.resolve({ id }) }));
  await act(async () => { finish({ savedId: id }); });
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith(`/manage/support/${id}`));
});
it("retains unsaved input and its original version across a server refresh", async () => {
  const view = render(await EditPage({ params: Promise.resolve({ id }) }));
  fireEvent.change(screen.getByLabelText(/내용/), { target: { value: "내 미저장 내용" } });
  m.get.mockResolvedValue({ inquiry: { ...inquiry, body: "다른 탭 내용", updated_at: "2026-10-16T02:00:00Z" }, isMaster: false, user: { id: "own" } });
  view.rerender(await EditPage({ params: Promise.resolve({ id }) }));
  expect(screen.getByLabelText(/내용/)).toHaveValue("내 미저장 내용");
  expect(document.querySelector("input[name=version]")).toHaveValue(inquiry.updated_at);
});
