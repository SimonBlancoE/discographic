// Public user projection. Use this everywhere we hand a user object to the
// client so secrets (password_hash) cannot leak by accident.

export const USER_PUBLIC_COLUMNS = 'id, username, role, created_at';

export function serializeUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, role: user.role, created_at: user.created_at };
}
