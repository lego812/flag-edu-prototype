import { AsyncLocalStorage } from "node:async_hooks";
import { Server } from "node:http";

// Read-only test-server instrumentation, never loaded by dev/build/Vercel.
// Records neither cookies, bodies, query strings nor authorization headers.
const requests = new AsyncLocalStorage();
const emit = Server.prototype.emit;
const stderr = process.stderr.write;
let sequence = 0;
Server.prototype.emit = function (event, ...args) {
  if (event !== "request") return Reflect.apply(emit, this, [event, ...args]);
  const [request, response] = args;
  const id = ++sequence;
  const route = new URL(request.url, "http://localhost:3001").pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ":id");
  const record = (kind, extra = {}) => process.stdout.write("QA_REQUEST:" + JSON.stringify({ time: Date.now(), id, route, kind, ...extra }) + "\n");
  record("start", { method: request.method, rsc: request.headers.rsc === "1", prefetch: request.headers["next-router-prefetch"] === "1" });
  response.once("close", () => record("close", { completed: response.writableFinished, status: response.statusCode }));
  return requests.run({ id, route }, () => Reflect.apply(emit, this, [event, ...args]));
};
process.stderr.write = function (...args) {
  const request = requests.getStore();
  if (request) process.stdout.write("QA_SERVER_DIAGNOSTIC:" + JSON.stringify({ time: Date.now(), ...request }) + "\n");
  return Reflect.apply(stderr, this, args); // Preserve the original error.
};
