import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassStatusBadge } from "./session-card";

describe("class status colors", () => {
  it.each([
    ["scheduled", "예정", "bg-amber-100"],
    ["cancelled", "취소", "bg-red-100"],
    ["completed", "완료", "bg-emerald-100"],
  ] as const)("maps %s to the required label and color", (status, label, color) => {
    render(<ClassStatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveClass(color);
  });
});
