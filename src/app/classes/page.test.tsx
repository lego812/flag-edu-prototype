import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassesPage from "./page";

const { preference } = vi.hoisted(() => ({ preference: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: preference }) }));
beforeEach(() => preference.mockReturnValue(undefined));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: async () => ({ supabase: {}, profile: { id: "coach", organization_id: "org" } }),
}));
vi.mock("@/features/classes/repository", () => ({
  CLASS_PAGE_SIZE: 20,
  classRepository: () => ({ list: async () => ({ data: [], count: 0 }), calendar: async () => ({ data: [], count: 0 }) }),
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

describe("class default view", () => {
  it.each([undefined, { value: "unknown" }])("defaults to calendar without a valid preference (%j)", async (cookie) => {
    preference.mockReturnValue(cookie);
    render(await ClassesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "캘린더" })).toHaveAttribute("aria-current", "page");
  });
  it("keeps a remembered list preference", async () => {
    preference.mockReturnValue({ value: "list" });
    render(await ClassesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "목록" })).toHaveAttribute("aria-current", "page");
  });
  it("lets an explicit view override the remembered preference", async () => {
    preference.mockReturnValue({ value: "list" });
    render(await ClassesPage({ searchParams: Promise.resolve({ view: "calendar" }) }));
    expect(screen.getByRole("link", { name: "캘린더" })).toHaveAttribute("aria-current", "page");
  });
});
