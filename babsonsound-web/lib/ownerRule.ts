/**
 * An owner is someone whose email is listed in OWNER_EMAILS AND whose email is verified.
 * Without the verified check, anyone could sign up with an owner's address before that owner has an account and
 * become an admin. Plain functions (no server imports) so the node test runner can load them.
 */
export const isVerifiedOwner = (email: string | null | undefined, emailVerified: unknown, owners: string[]) =>
  !!email && emailVerified === true && owners.includes(email.trim().toLowerCase())

/** Any account may use this email only if it is not an owner address (used when someone picks an email by hand). */
export const isListedOwner = (email: string | null | undefined, owners: string[]) =>
  !!email && owners.includes(email.trim().toLowerCase())
