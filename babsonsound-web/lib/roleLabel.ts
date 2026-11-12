// How a role is shown to people. The stored value stays `director` (it is in Firestore, the tokens and the iOS app); only the words change.
// One map for the server (messages, emails) and the client (pages), so the label is never typed twice.

export const ROLE_LABEL: Readonly<Record<string, string>> = { guest: 'Guest', student: 'Student', director: 'E-board', admin: 'Admin' }

/** "E-board" for the stored value `director`. Anything unknown is returned as it is. */
export const roleLabel = (level: string): string => ROLE_LABEL[level] ?? level

/** The sentences the server uses when it turns someone away, so they all say the same thing. */
export const STAFF_ONLY = `${roleLabel('director')} and admins only.`
export const STAFF_NAME = `${roleLabel('director')} or Admin`
