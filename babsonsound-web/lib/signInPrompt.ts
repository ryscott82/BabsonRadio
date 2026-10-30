// Asks the sign-in pop-up (components/SignInModal.tsx) to open over the current page, so signed-out visitors can sign in without leaving it.
export const openSignIn = (create = false) => window.dispatchEvent(new CustomEvent<boolean>('br:signin-open', { detail: create }))
