import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), replace: vi.fn() }));
vi.mock("./actions", () => ({ saveInquiryAction: m.save }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: m.replace }),
  usePathname: () => "/manage/support/new",
}));
import { InquiryForm } from "./form";
const id = "20000000-0000-4000-8000-000000000100";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function fill() {
  fireEvent.change(screen.getByLabelText(/제목/), {
    target: { value: "문의 제목" },
  });
  fireEvent.change(screen.getByLabelText(/내용/), {
    target: { value: "작성한 내용" },
  });
}
it("retains input on save failure and retries with the same creation ID", async () => {
  m.save
    .mockResolvedValueOnce({ error: "저장 실패" })
    .mockResolvedValueOnce({ savedId: id });
  render(<InquiryForm id={id} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "문의 등록" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText(/내용/)).toHaveValue("작성한 내용");
  fireEvent.click(screen.getByRole("button", { name: "문의 등록" }));
  await waitFor(() =>
    expect(m.replace).toHaveBeenCalledWith(`/manage/support/${id}`),
  );
  expect(m.save.mock.calls.map((c) => (c[1] as FormData).get("id"))).toEqual([
    id,
    id,
  ]);
});
it("blocks duplicate submissions while saving and keeps input after a transport error", async () => {
  let fail!: (reason: Error) => void;
  m.save.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  const { container } = render(<InquiryForm id={id} />);
  fill();
  fireEvent.submit(container.querySelector("form")!);
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  fail(new Error("secret transport data"));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).not.toHaveTextContent("secret");
  expect(screen.getByLabelText(/제목/)).toHaveValue("문의 제목");
  expect(screen.getByRole("button", { name: "문의 등록" })).toBeEnabled();
});
