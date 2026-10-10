// Accept only application destinations, never arbitrary URLs supplied in mail
// callbacks, forms or query strings. Invitation tokens stay scoped to one path.
export function invitationToken(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
    ? value
    : null;
}

export function tokenFromNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return invitationToken(/^\/invitations\/([0-9a-f]{64})$/.exec(value)?.[1]);
}

export function safeAuthNext(value: unknown, fallback = "/dashboard") {
  if (
    value === "/dashboard" ||
    value === "/welcome" ||
    value === "/set-password"
  )
    return value;
  const token = tokenFromNext(value);
  return token ? `/invitations/${token}` : fallback;
}

export function passwordSetupPath(next: string) {
  return `/set-password?next=${encodeURIComponent(safeAuthNext(next))}`;
}
