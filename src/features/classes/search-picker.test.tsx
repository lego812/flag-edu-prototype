import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassSearchPicker } from "./search-picker";
const search = vi.hoisted(() => vi.fn());
vi.mock("./search", () => ({ searchClasses: search }));
describe("ClassSearchPicker", () => {
  it("searches by name and submits the chosen ID, not the typed text", async () => {
    search.mockResolvedValue({
      data: [
        {
          id: "class-1",
          title: "체육",
          start_at: "2026-09-23T00:00:00Z",
          has_time: false,
        },
      ],
    });
    const { container } = render(
      <form>
        <ClassSearchPicker />
      </form>,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "체육" },
    });
    expect(new FormData(container.querySelector("form")!).get("session")).toBe(
      "",
    );
    fireEvent.click(await screen.findByRole("button", { name: /체육/ }));
    expect(new FormData(container.querySelector("form")!).get("session")).toBe(
      "class-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "수업 선택 해제" }));
    expect(new FormData(container.querySelector("form")!).get("session")).toBe(
      "",
    );
  });
  it("reports search failures without submitting a guessed ID", async () => {
    search.mockRejectedValue(new Error("network"));
    render(<ClassSearchPicker />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "체육" },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "검색하지 못했습니다",
      ),
    );
  });
});
