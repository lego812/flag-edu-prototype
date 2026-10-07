import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Photos } from "./photos";
import type { Attachment, Field } from "./model";
import type { Report } from "./model";
import { ReportMutationProvider } from "./mutation-context";
import { ReportEditor } from "./editor";

const actions = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./actions", () => ({ saveReportAction: actions.save }));
// Native dialog behavior is covered by photo-preview tests and browser QA.
vi.mock("./photo-preview", () => ({
  PhotoPreview: ({ label, onClose }: { label: string; onClose: () => void }) => (
    <section role="dialog" aria-label={label}>
      <button onClick={onClose}>닫기</button>
    </section>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const field: Field = {
  id: "40000000-0000-4000-8000-000000000001",
  label: "활동 사진",
  help_text: null,
  field_type: "photo",
  required: false,
  sort_order: 0,
  settings: { max_files: 5 },
  field_options: [],
};

const attachments: Attachment[] = Array.from({ length: 4 }, (_, index) => ({
  id: `50000000-0000-4000-8000-00000000000${index + 1}`,
  field_id: field.id,
  storage_path: `org/report/photo-${index + 1}.jpg`,
  original_filename: `photo-${index + 1}.jpg`,
  url: `https://example.com/photo-${index + 1}.jpg`,
}));

describe("photo thumbnails", () => {
  afterEach(() => vi.restoreAllMocks());
  it("renders compact thumbnails in one horizontally scrollable row", () => {
    render(
      <Photos
        reportId="30000000-0000-4000-8000-000000000001"
        fields={[field]}
        attachments={attachments}
        editable
      />,
    );

    const list = screen.getByRole("list", {
      name: "활동 사진 4장",
    });
    expect(list).toHaveClass("flex-nowrap", "overflow-x-auto", "snap-x");
    expect(screen.getByText("4/5장")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /사진 \d 삭제/ })).toHaveLength(
      4,
    );
    expect(screen.getByLabelText("활동 사진 선택")).toHaveAttribute(
      "accept",
      "image/*",
    );
    expect(screen.queryByText("촬영")).not.toBeInTheDocument();
  });

  it("keeps the read-only thumbnail row free of editing controls", () => {
    render(
      <Photos
        reportId="30000000-0000-4000-8000-000000000001"
        fields={[field]}
        attachments={attachments}
        editable={false}
      />,
    );

    expect(screen.queryByLabelText("활동 사진 선택")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /사진 \d 삭제/ }),
    ).not.toBeInTheDocument();
  });

  it("shows quiet reading labels, attached count and accessible enlargement buttons", () => {
    render(<Photos reportId="report" fields={[{ ...field, required: true }]} attachments={attachments} editable={false} reading />);
    expect(screen.getByRole("heading", { name: "활동 사진" })).toHaveClass("text-sm", "text-neutral-600");
    expect(screen.getByText("4장")).toBeInTheDocument();
    expect(screen.queryByText("4/5장")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "활동 사진 1 크게 보기" })).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByText("사진을 누르면 크게 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("활동 사진 선택")).not.toBeInTheDocument();
  });

  it("keeps unavailable signed images non-interactive instead of opening an empty preview", () => {
    render(<Photos reportId="report" fields={[field]} attachments={[{ ...attachments[0], url: undefined }]} editable={false} reading />);
    expect(screen.getByText("사진을 열지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /크게 보기/ })).not.toBeInTheDocument();
  });

  it("restores focus to the exact thumbnail after a read-only preview closes without fetching", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<Photos reportId="report" fields={[field]} attachments={attachments} editable={false} reading />);
    const trigger = screen.getByRole("button", { name: "활동 사진 2 크게 보기" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "활동 사진 2" })).toBeInTheDocument();
    screen.getByRole("button", { name: "닫기" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses an in-app confirmation dialog and removes the thumbnail without a page refresh", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <Photos
        reportId="30000000-0000-4000-8000-000000000001"
        fields={[field]}
        attachments={attachments}
        editable
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "활동 사진 1 삭제" }));
    expect(screen.getByRole("dialog", { name: "사진을 삭제할까요?" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.getByText("3/5장")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/30000000-0000-4000-8000-000000000001/photos",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shares the exact returned revision across answer save, photo delete and immediate submit", async () => {
    const report = {
      id: "30000000-0000-4000-8000-000000000001",
      updated_at: "version-1", status: "draft", report_answers: [],
      class_sessions: { status: "scheduled" },
    } as unknown as Report;
    actions.save.mockReset().mockResolvedValueOnce({ success: "저장했습니다.", version: "version-2" }).mockResolvedValueOnce({ success: "제출했습니다.", version: "version-4" });
    let complete!: (value: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(resolve => { complete = resolve; }));
    render(
      <ReportMutationProvider version={report.updated_at}>
        <ReportEditor report={report} fields={[]} />
        <Photos reportId={report.id} fields={[field]} attachments={attachments} editable />
      </ReportMutationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    await screen.findByText("저장했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "활동 사진 1 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ id: attachments[0].id, version: "version-2" });
    expect(screen.getByRole("button", { name: "임시저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();
    expect(screen.getByLabelText("활동 사진 선택")).toBeDisabled();
    complete(new Response(JSON.stringify({ ok: true, version: "version-3" }), { status: 200 }));
    await waitFor(() => expect(screen.getByText("3/5장")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    await screen.findByText("제출했습니다.");
    expect(actions.save.mock.calls[1][2].get("version")).toBe("version-3");
    expect(actions.save.mock.calls[1][2].get("intent")).toBe("submit");
  });

  it("does not adopt a newer revision or remove a photo after a conflict", async () => {
    const report = {
      id: "report", updated_at: "old-version", status: "draft", report_answers: [],
      class_sessions: { status: "scheduled" },
    } as unknown as Report;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "다른 화면에서 변경됐습니다.", version: "other-writer" }), { status: 409 }));
    const ui = render(
      <ReportMutationProvider version={report.updated_at}>
        <ReportEditor report={report} fields={[]} />
        <Photos reportId={report.id} fields={[field]} attachments={attachments} editable />
      </ReportMutationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "활동 사진 1 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다른 화면에서 변경됐습니다.");
    expect(screen.getByText("4/5장")).toBeInTheDocument();
    expect(ui.container.querySelector('input[name="version"]')).toHaveValue("old-version");
    expect(screen.getByRole("button", { name: "제출" })).not.toBeDisabled();
  });
});
