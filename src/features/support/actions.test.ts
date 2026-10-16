// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  account: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/features/master/access", () => ({ masterAccount: m.account }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { saveInquiryAction } from "./actions";
const id = "20000000-0000-4000-8000-000000000100";
function form(title = "제목", body = "내용", version = "") {
  const f = new FormData();
  for (const [k, v] of Object.entries({ id, title, body, version }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.account.mockResolvedValue({ isMaster: false, supabase: { rpc: m.rpc } });
  m.rpc.mockResolvedValue({ data: id, error: null });
});
it("authorizes before mutations and refuses master even with forged form role", async () => {
  m.account.mockResolvedValue({ isMaster: true });
  const f = form();
  f.set("role", "coach");
  expect(await saveInquiryAction({}, f)).toEqual({
    error: "master는 문의글 조회만 가능합니다.",
  });
  expect(m.rpc).not.toHaveBeenCalled();
});
it("validates fields and preserves exact DB version precision for editing", async () => {
  for (const f of [
    form(" ", "내용"),
    form("x".repeat(101)),
    form("제목", "x".repeat(5001)),
    form("제목", "내용", "invalid"),
  ])
    expect((await saveInquiryAction({}, f)).error).toBeTruthy();
  expect(m.rpc).not.toHaveBeenCalled();
  const version = "2026-10-16T09:00:00.123456+00:00";
  expect(
    await saveInquiryAction({}, form(" 제목 ", " 내용 ", version)),
  ).toEqual({ savedId: id });
  expect(m.rpc).toHaveBeenCalledWith("save_support_inquiry", {
    p_id: id,
    p_title: "제목",
    p_body: "내용",
    p_expected_updated_at: version,
  });
  expect(m.revalidate).toHaveBeenCalledWith("/manage/support");
});
it("uses the stable request ID for registration without accepting an author ID", async () => {
  const f = form();
  f.set("author_id", "someone-else");
  await saveInquiryAction({}, f);
  expect(m.rpc).toHaveBeenCalledWith("save_support_inquiry", {
    p_id: id,
    p_title: "제목",
    p_body: "내용",
    p_expected_updated_at: null,
  });
});
it("maps conflicts and permission failures without leaking database details", async () => {
  for (const [code, message] of [
    ["40001", "이미 저장되었거나"],
    ["42501", "본인이 작성한"],
    ["XX000", "저장하지 못했습니다"],
  ]) {
    m.rpc.mockResolvedValue({
      error: { code, message: "secret internal error" },
    });
    const r = await saveInquiryAction({}, form());
    expect(r.error).toContain(message);
    expect(r.error).not.toContain("secret");
  }
  expect(m.revalidate).not.toHaveBeenCalled();
});
