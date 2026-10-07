// A WebKit native console load-cancellation message is not sufficient evidence
// of an uncaught JS exception. Callers must also gate DOM error/rejection events
// and retain this warning. Unmatched access-control errors remain failures.
export function findNativeCancellation(error, requests) {
  const suffix = " due to access control checks.";
  if (!error.message.endsWith(suffix)) return undefined;
  return requests.find(request => {
    if (request.role !== error.role || request.reason !== "Load request cancelled") return false;
    if (!Number.isFinite(request.time) || !Number.isFinite(error.time) || Math.abs(request.time - error.time) >= 1000) return false;
    if (typeof request.url !== "string" || !/^https?:\/\//.test(request.url)) return false;
    return error.rawMessage.endsWith(request.url.replace(/^https?:\/\//, "") + suffix);
  });
}
