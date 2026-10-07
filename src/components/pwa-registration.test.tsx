import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PwaRegistration } from "./pwa-registration";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("checks the current production worker without using an HTTP script cache", () => {
  vi.stubEnv("NODE_ENV", "production");
  const register = vi.fn().mockResolvedValue({});
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  render(<PwaRegistration />);
  expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js", { updateViaCache: "none" });
});

it("does not register a worker in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  const register = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  render(<PwaRegistration />);
  expect(register).not.toHaveBeenCalled();
});

it("preserves real registration failure diagnostics", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const error = new Error("worker unavailable");
  const register = vi.fn().mockRejectedValue(error);
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  render(<PwaRegistration />);
  await waitFor(() => expect(diagnostic).toHaveBeenCalledWith("서비스 워커 등록에 실패했습니다.", error));
});
