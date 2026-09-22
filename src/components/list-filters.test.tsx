import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListFilters } from "./list-filters";

describe("ListFilters", () => {
  it("keeps filters collapsed until opened without losing their values", () => {
    const { container } = render(
      <ListFilters>
        <label>
          시작일
          <input name="from" defaultValue="2026-09-22" />
        </label>
      </ListFilters>,
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("조회 필터"));
    expect(details.open).toBe(true);
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-09-23" },
    });
    fireEvent.click(screen.getByText("조회 필터"));
    fireEvent.click(screen.getByText("조회 필터"));
    expect(screen.getByLabelText("시작일")).toHaveValue("2026-09-23");
  });
});
