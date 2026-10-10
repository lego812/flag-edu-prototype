import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FilterForm } from "./filter-form";
import { SubmitButton } from "./submit-button";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
it("keeps a native GET fallback and encodes query values, repeated fields and the submitter", () => {
  render(<FilterForm action="/classes">
    <input name="from" defaultValue="2026-10-01" />
    <input name="tag" defaultValue="한글 & 공간" />
    <input name="tag" defaultValue="두번째" />
    <SubmitButton name="view" value="list">조회</SubmitButton>
  </FilterForm>);
  expect(screen.getByRole("button", { name: "조회" }).closest("form")).toHaveAttribute("action", "/classes");
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
  const result = new URL(push.mock.calls[0][0], "https://example.com");
  expect(result.pathname).toBe("/classes");
  expect(result.searchParams.get("from")).toBe("2026-10-01");
  expect(result.searchParams.getAll("tag")).toEqual(["한글 & 공간", "두번째"]);
  expect(result.searchParams.get("view")).toBe("list");
});
