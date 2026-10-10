// Sample request time outside the React rendering function. Acceptance always
// checks expiration again against the database clock inside its transaction.
export function isInvitationExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}
