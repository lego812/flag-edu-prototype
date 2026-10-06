import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("Home", () => {
  it("redirects the root route directly to login", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
