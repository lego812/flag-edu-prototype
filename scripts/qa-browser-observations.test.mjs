import { describe, expect, it } from "vitest";
import { findNativeCancellation, isCurrentDocument, isLocalDevelopmentDiagnostic } from "./qa-browser-observations.mjs";

const request = { role: "coach", url: "https://example.com/api/workspaces/current", reason: "Load request cancelled", time: 10_000 };
const message = "Fetch API cannot load https://example.com/api/workspaces/current due to access control checks.";
const error = { role: "coach", rawMessage: message, message, time: 10_100 };

it("does not reload a document already reached by login, but preserves route and filter changes", () => {
  const current = "https://example.com/dashboard";
  expect(isCurrentDocument(current, current)).toBe(true);
  expect(isCurrentDocument(current + "#top", current)).toBe(true);
  for (const target of [
    "https://other.example.com/dashboard", "https://example.com/courses",
    current + "?filter=all", current + "/",
  ]) expect(isCurrentDocument(current, target)).toBe(false);
  expect(isCurrentDocument("https://example.com/classes?view=list", "https://example.com/classes?view=calendar")).toBe(false);
});

it("separates only the exact local Next error-overlay diagnostic POST from business writes", () => {
  const base = "http://localhost:3000";
  const diagnostic = base + "/__nextjs_original-stack-frames";
  expect(isLocalDevelopmentDiagnostic(base, "POST", diagnostic)).toBe(true);
  for (const [origin, method, url] of [
    ["https://flag-edu-prototype.vercel.app", "POST", diagnostic],
    [base, "DELETE", diagnostic], [base, "POST", base + "/api/photos"],
    [base, "POST", diagnostic + "/extra"], [base, "POST", "http://other.local/__nextjs_original-stack-frames"],
  ]) expect(isLocalDevelopmentDiagnostic(origin, method, url)).toBe(false);
});

describe("native WebKit cancellation evidence", () => {
  it("requires a contemporaneous same-role exact-resource cancellation", () => {
    expect(findNativeCancellation(error, [request])).toBe(request);
    expect(findNativeCancellation({ ...error, stack: "fetch initiator" }, [request])).toBe(request);
  });
  it("does not excuse a real access denial or unrelated network failure", () => {
    for (const reason of ["Access denied", "Connection refused", "Failed"]) {
      expect(findNativeCancellation(error, [{ ...request, reason }])).toBeUndefined();
    }
    expect(findNativeCancellation({ ...error, message: "TypeError: app failure" }, [request])).toBeUndefined();
  });
  it("does not correlate other users, old requests or invalid timestamps", () => {
    for (const changes of [{ role: "admin" }, { time: 8000 }, { time: NaN }]) {
      expect(findNativeCancellation(error, [{ ...request, ...changes }])).toBeUndefined();
    }
  });
  it("does not match resource prefixes, another origin or missing evidence", () => {
    for (const url of ["https://example.com/api/workspaces", "https://other.example.com/api/workspaces/current", undefined]) {
      expect(findNativeCancellation(error, [{ ...request, url }])).toBeUndefined();
    }
    expect(findNativeCancellation(error, [])).toBeUndefined();
  });
});
