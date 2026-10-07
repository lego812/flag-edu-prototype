import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { beforeEach, expect, it, vi } from "vitest";

let handlers, worker, cache, caches, fetchNetwork;
beforeEach(async () => {
  handlers = {};
  worker = {
    location: { origin: "https://example.com" },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: vi.fn(), clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };
  cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(undefined) };
  caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue(["flag-edu-shell-v2", "flag-edu-shell-v3", "unrelated-cache"]),
    delete: vi.fn().mockResolvedValue(true),
  };
  fetchNetwork = vi.fn().mockResolvedValue(new Response("public asset"));
  vm.runInNewContext(await readFile("public/sw.js", "utf8"), { self: worker, caches, fetch: fetchNetwork, URL, Response });
});

const request = (url, changes = {}) => ({ method: "GET", mode: "cors", url, headers: new Headers(), ...changes });
function dispatch(request) {
  const respondWith = vi.fn();
  handlers.fetch({ request, respondWith });
  return respondWith;
}

it("precaches only public installation assets, never personalized HTML", async () => {
  const waitUntil = vi.fn();
  handlers.install({ waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(cache.addAll).toHaveBeenCalledWith(["/manifest.webmanifest", "/icon.svg"]);
  expect(worker.skipWaiting).toHaveBeenCalledOnce();
});

it("clears only obsolete owned caches and then claims clients", async () => {
  const waitUntil = vi.fn();
  handlers.activate({ waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(caches.delete).toHaveBeenCalledExactlyOnceWith("flag-edu-shell-v2");
  expect(worker.clients.claim).toHaveBeenCalledOnce();
});

it("does not intercept HTML, RSC, API, private photos, other origins or mutations", () => {
  for (const url of [
    "https://example.com/", "https://example.com/login", "https://example.com/reports/example",
    "https://example.com/api/workspaces/current", "https://example.com/_next/static/example.js",
    "https://example.com/classes?_rsc=example", "https://example.com/icon.svg?version=1",
    "https://storage.example.com/manifest.webmanifest", "https://storage.example.com/private-photo.jpg",
  ]) expect(dispatch(request(url))).not.toHaveBeenCalled();
  for (const changes of [{ method: "POST" }, { mode: "navigate" }, { headers: new Headers({ RSC: "1" }) }]) {
    expect(dispatch(request("https://example.com/icon.svg", changes))).not.toHaveBeenCalled();
  }
  expect(fetchNetwork).not.toHaveBeenCalled();
});

it("passes successful public network responses through without replacing them", async () => {
  for (const path of ["/icon.svg", "/manifest.webmanifest"]) {
    const network = new Response("fresh public asset");
    fetchNetwork.mockResolvedValueOnce(network);
    const response = dispatch(request("https://example.com" + path));
    expect(await response.mock.calls[0][0]).toBe(network);
  }
  expect(cache.match).not.toHaveBeenCalled();
});

it("uses only its own public asset cache on a network failure", async () => {
  fetchNetwork.mockRejectedValue(new Error("network unavailable"));
  const asset = new Response("cached icon");
  cache.match.mockResolvedValue(asset);
  const response = dispatch(request("https://example.com/icon.svg"));
  expect(await response.mock.calls[0][0]).toBe(asset);
  expect(caches.match).not.toHaveBeenCalled();
});

it("returns a real 503 response rather than undefined on a public cache miss", async () => {
  fetchNetwork.mockRejectedValue(new Error("network unavailable"));
  const response = dispatch(request("https://example.com/icon.svg"));
  const result = await response.mock.calls[0][0];
  expect(result).toBeInstanceOf(Response);
  expect(result.status).toBe(503);
});

it("does not conceal HTTP server errors behind cached successful assets", async () => {
  const error = new Response("server error", { status: 500 });
  fetchNetwork.mockResolvedValue(error);
  const response = dispatch(request("https://example.com/icon.svg"));
  expect(await response.mock.calls[0][0]).toBe(error);
  expect(cache.match).not.toHaveBeenCalled();
});
