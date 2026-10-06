import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
