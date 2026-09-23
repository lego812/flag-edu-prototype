import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountPicker } from "./count-picker";
describe("CountPicker", () => {
  it("selects zero and another count through the wheel", () => {
    const { container } = render(
      <form>
        <CountPicker name="count" label="인원" max={10} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "인원" }));
    fireEvent.click(screen.getByRole("option", { name: "0" }));
    expect(new FormData(container.querySelector("form")!).get("count")).toBe(
      "0",
    );
    fireEvent.click(screen.getByRole("button", { name: "인원" }));
    fireEvent.click(screen.getByRole("option", { name: "7" }));
    expect(new FormData(container.querySelector("form")!).get("count")).toBe(
      "7",
    );
  });
  it("does not submit disabled counts", () => {
    const { container } = render(
      <form>
        <CountPicker name="count" label="인원" defaultValue="3" disabled />
      </form>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(new FormData(container.querySelector("form")!).has("count")).toBe(
      false,
    );
  });
  it("clears a selected count without turning it into zero", () => {
    const { container } = render(
      <form>
        <CountPicker name="count" label="인원" defaultValue="3" max={10} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "인원" }));
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    expect(new FormData(container.querySelector("form")!).get("count")).toBe(
      "",
    );
    expect(screen.getByRole("button", { name: "인원" })).toHaveTextContent(
      "선택",
    );
  });
});
