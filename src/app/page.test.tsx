import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import { getPublicEnvStatus } from "@/lib/env";

vi.mock("@/lib/env", () => ({ getPublicEnvStatus: vi.fn() }));

describe("Home", () => {
  it("renders the Flag Edu foundation screen", () => {
    vi.mocked(getPublicEnvStatus).mockReturnValue({ configured: true, missing: [] });
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Flag Edu" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Supabase 연결 준비 완료")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기존 사용자 로그인" })).toHaveAttribute("href", "/login");
  });
  it("still explains missing configuration", () => {
    vi.mocked(getPublicEnvStatus).mockReturnValue({ configured: false, missing: ["NEXT_PUBLIC_SUPABASE_URL"] });
    render(<Home />);
    expect(screen.getByRole("alert")).toHaveTextContent("NEXT_PUBLIC_SUPABASE_URL");
    expect(screen.queryByRole("link", { name: "기존 사용자 로그인" })).not.toBeInTheDocument();
  });
});
