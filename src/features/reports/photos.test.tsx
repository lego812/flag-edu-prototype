import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Photos } from "./photos";
import type { Attachment, Field } from "./model";

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
});
