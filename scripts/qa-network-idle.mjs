// Playwright's document load state can remain "networkidle" across a Next
// client navigation. Observe fresh context-level requests instead of treating
// that old load state as evidence that newly visible Link prefetches finished.
export function observeReadOnlyNetwork(context, origin) {
  const pending = new Set();
  let changedAt = Date.now();
  context.on("request", request => {
    if (request.method() !== "GET" || new URL(request.url()).origin !== origin) return;
    pending.add(request);
    changedAt = Date.now();
  });
  const finished = request => {
    if (pending.delete(request)) changedAt = Date.now();
  };
  context.on("requestfinished", finished);
  context.on("requestfailed", finished);
  return async function settle() {
    const deadline = Date.now() + 30_000;
    while (pending.size || Date.now() - changedAt < 1000) {
      if (Date.now() >= deadline) throw new Error("Read-only navigation requests did not settle within 30 seconds");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
}
