/** An id Better Auth handed out that is not the integer the database keys rows with. */
export class UserIdError extends Error {
  constructor(id: unknown) {
    super(`[auth] user id ${JSON.stringify(id)} is not a database id.`);
    this.name = "UserIdError";
  }
}

/**
 * The database's key for a signed-in user.
 *
 * `generateId: "serial"` lets Postgres hand out the ids, and Better Auth reads and writes
 * them as strings on every session and every endpoint body. A store that keys a row by
 * its owner (`where: { user_id }`) needs the number, and this is the one place the two
 * meet — an inline `Number(user.id)` in a store is a second copy of this rule.
 */
export function userIdOf(session: { user: { id: string | number } }): number {
  const raw = session.user.id;
  const id = typeof raw === "number" ? raw : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new UserIdError(raw);
  return id;
}
