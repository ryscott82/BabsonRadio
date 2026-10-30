// Names typed into one "Name" box. School emails carry part of the last name, so when only a first name is typed the rest can come from the email:
//   Babson     rscott1@babson.edu       first initial + last name + optional number  ->  Scott
//   Olin       rscott@olin.edu          the same, without numbers                    ->  Scott
//   Wellesley  rs103@wellesley.edu      first initial + last initial + number        ->  S   (only the initial is certain)
// Pure, so the server and the tests share it.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

/** The last name (or last initial, like "S", for Wellesley) a school email gives; null when the address does not fit one of the patterns. */
export function lastNameFromEmail(email: string): string | null {
  const e = email.trim()
  const full = /^[a-z]([a-z]{2,40})\d*@(babson|olin)\.edu$/i.exec(e)
  if (full) return cap(full[1])
  const initial = /^[a-z]([a-z])\d+@wellesley\.edu$/i.exec(e)
  return initial ? initial[1].toUpperCase() : null
}

/** What was typed, split into first and last. With one word and a fitting school email, the last name (or initial) is filled in from the email. */
export function splitName(typed: string, email = ''): { firstName: string; lastName: string } {
  const parts = typed.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length > 1) return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
  return { firstName: parts[0], lastName: lastNameFromEmail(email) ?? '' }
}
