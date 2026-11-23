// Vite exposes this list to the browser. Data access must also be enforced by Firebase Rules.
const adminUids = new Set(
  (import.meta.env.VITE_ADMIN_UIDS || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean),
)

export function isAdminUser(user) {
  return Boolean(user?.uid && adminUids.has(user.uid))
}
