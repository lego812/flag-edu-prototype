import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClassesPage from "./page";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: async () => ({ supabase: {}, profile: { id: "coach", organization_id: "org" } }),
}));
vi.mock("@/features/classes/repository", () => ({
  CLASS_PAGE_SIZE: 20,
  classRepository: () => ({ list: async () => ({ data: [], count: 0 }) }),
}));
vi.mock("@/components/list-filters", () => ({
  ListFilters: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("class filter navigation", () => {
  it("resets edited dates, status and sort controls on server filter navigation", async () => {
    const ui = render(await ClassesPage({ searchParams: Promise.resolve({ view: "list", sort: "oldest" }) }));
    fireEvent.change(screen.getByLabelText("조회 시작일"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("조회 종료일"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByRole("combobox", { name: "상태" }), { target: { value: "completed" } });
    ui.rerender(await ClassesPage({ searchParams: Promise.resolve({ view: "list", from: "2026-10-05", to: "2026-10-05", status: "completed", sort: "oldest" }) }));
    ui.rerender(await ClassesPage({ searchParams: Promise.resolve({ view: "list", sort: "newest" }) }));
    expect(screen.getByLabelText("조회 시작일")).toHaveValue("");
    expect(screen.getByLabelText("조회 종료일")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "상태" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "정렬" })).toHaveValue("newest");
  });
});
