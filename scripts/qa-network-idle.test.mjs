import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { observeReadOnlyNetwork } from "./qa-network-idle.mjs";

afterEach(() => vi.useRealTimers());
const request = (url = "https://example.com/courses?_rsc=example", method = "GET") => ({ url: () => url, method: () => method });

it("waits for a fresh quiet interval, even if the document's old load state is idle", async () => {
  vi.useFakeTimers();
  const context = new EventEmitter();
  const settle = observeReadOnlyNetwork(context, "https://example.com");
  let done = false;
  const waiting = settle().then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(900);
  expect(done).toBe(false);
  const prefetch = request();
  context.emit("request", prefetch);
  await vi.advanceTimersByTimeAsync(2000);
  expect(done).toBe(false);
  context.emit("requestfinished", prefetch);
  await vi.advanceTimersByTimeAsync(999);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(51);
  await waiting;
  expect(done).toBe(true);
});

it("observes cancellations without suppressing errors and does not track other origins or writes", async () => {
  vi.useFakeTimers();
  const context = new EventEmitter();
  const settle = observeReadOnlyNetwork(context, "https://example.com");
  for (const untracked of [request("https://other.example.com/photo"), request("https://example.com/login", "POST")]) context.emit("request", untracked);
  const cancelled = request();
  context.emit("request", cancelled);
  context.emit("requestfailed", cancelled);
  const waiting = settle();
  await vi.advanceTimersByTimeAsync(1000);
  await waiting;
  // This helper only waits; the suite's independent error gates stay intact.
  expect(context.listenerCount("pageerror")).toBe(0);
});

it("fails on a request that never completes instead of proceeding to abort it", async () => {
  vi.useFakeTimers();
  const context = new EventEmitter();
  const settle = observeReadOnlyNetwork(context, "https://example.com");
  context.emit("request", request());
  const failure = expect(settle()).rejects.toThrow("did not settle within 30 seconds");
  await vi.advanceTimersByTimeAsync(30_000);
  await failure;
});

it("identifies an unfinished worker request without logging identifiers or query secrets", async () => {
  vi.useFakeTimers();
  const context = new EventEmitter();
  const settle = observeReadOnlyNetwork(context, "https://example.com");
  context.emit("request", {
    ...request("https://example.com/reports/12345678-1234-1234-1234-123456789abc?token=private-example"),
    resourceType: () => "fetch", serviceWorker: () => ({}),
  });
  const waiting = settle().catch(error => error.message);
  await vi.advanceTimersByTimeAsync(30_000);
  const message = await waiting;
  expect(message).toContain('"path":"/reports/:id"');
  expect(message).toContain('"serviceWorker":true');
  expect(message).not.toContain("12345678");
  expect(message).not.toContain("token");
  expect(message).not.toContain("private-example");
});
