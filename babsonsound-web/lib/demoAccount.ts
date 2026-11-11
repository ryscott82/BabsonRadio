// The hidden App Store reviewer account (users/{uid}.demo === true, made by scripts/create-account.mjs demo ...).
// It is never deleted: not by itself, not by an admin, not by the unverified-account sweep.
export const DEMO_DELETE_MESSAGE =
  'This is a demo account, so nothing was deleted. In a normal account, this removes the account and its information. You can create your own account to try it.'
