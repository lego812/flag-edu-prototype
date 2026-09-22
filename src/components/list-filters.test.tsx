import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListFilters } from "./list-filters";

describe("ListFilters", () => {
  it("keeps filters collapsed until opened without losing their values", () => {
    render(
      <ListFilters from="2026-09-22" to="2026-09-30">
        <label>
          시작일
          <input name="from" defaultValue="2026-09-22" />
        </label>
      </ListFilters>,
    );
    const toggle = screen.getByRole("button", { name: "필터" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("9월 22일 ~ 9월 30일")).toBeInTheDocument();
    fireEvent.click(screen.getByText("필터"));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-09-23" },
    });
    fireEvent.click(screen.getByText("필터"));
    fireEvent.click(screen.getByText("필터"));
    expect(screen.getByLabelText("시작일")).toHaveValue("2026-09-23");
  });
});
