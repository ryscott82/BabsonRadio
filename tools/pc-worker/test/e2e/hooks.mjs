// Sends the worker's firebase imports to the test stand-in.
const FAKE = new URL('./fake-firestore.mjs', import.meta.url).href
export async function resolve(specifier, context, next) {
  if (specifier === 'firebase/app' || specifier === 'firebase/auth' || specifier === 'firebase/firestore') return { url: FAKE, shortCircuit: true }
  return next(specifier, context)
}
