import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportMetadata } from "./metadata";

describe("ReportMetadata", () => {
  it("shows only the author and creation time in Korean time", () => {
    const { container } = render(
      <ReportMetadata name="박다빈" createdAt="2026-09-22T01:30:00Z" />,
    );
    expect(screen.getByText(/박다빈/)).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-09-22T01:30:00Z",
    );
    expect(container.querySelector("time")?.textContent).toContain("10:30");
    expect(container.textContent).not.toMatch(
      /작성자|작성일시|미제출|양식|시간 미정/,
    );
  });
});
