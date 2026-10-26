import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportMetadata } from "./metadata";

describe("ReportMetadata", () => {
  it("prioritizes the class schedule and keeps creation time as details", () => {
    const { container } = render(
      <ReportMetadata
        name="김남중"
        createdAt="2026-10-23T08:13:00Z"
        classStartAt="2026-10-22T05:00:00Z"
        location="강남센터"
      />,
    );
    expect(screen.getByText(/김남중/)).toBeInTheDocument();
    expect(screen.getByText(/수업일시/)).toBeInTheDocument();
    expect(screen.getByText(/2026년 10월 22일/)).toBeInTheDocument();
    expect(screen.getByText(/강남센터/)).toBeInTheDocument();
    expect(screen.getByText(/상세정보:/)).toHaveTextContent(/2026년 10월 23일.*작성/);
    expect(container.querySelectorAll("time")[1]).toHaveAttribute(
      "dateTime",
      "2026-10-23T08:13:00Z",
    );
  });

  it("labels a class without a fixed time", () => {
    render(
      <ReportMetadata
        name="김남중"
        createdAt="2026-10-23T08:13:00Z"
        classStartAt="2026-10-22T15:00:00Z"
        classHasTime={false}
        location="강남센터"
      />,
    );
    expect(screen.getByText(/시간 미정/)).toBeInTheDocument();
  });
});
