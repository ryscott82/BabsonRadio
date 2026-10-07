# Going fully public

Today: Babson / Olin / Wellesley emails are members; everyone else is a guest (72-hour live trial, or a pass a student sponsors) or a beta tester the station added.

## The switch
Set `NEXT_PUBLIC_ACCESS_MODE=public` in Vercel and redeploy. New sign-ups from any email get an `openMember` sign-in claim, which the server, the Firestore rules and the website already treat as member access. Existing accounts are unchanged.

## Before flipping it (in this order)
1. **Rules:** `firebase deploy --only firestore:rules` (the `openMember` check is already in `isBabson()`).
2. **Terms and privacy:** both say "Babson, Olin and Wellesley students". Update the eligibility, age (13+ or 18+?), and arbitration sections; the student-discipline route in section 18 does not apply to outsiders. Have counsel review.
3. **Groups and presence:** "people in your concentration" only makes sense among students. Decide whether outsiders appear in those counts (default today: they would). Easiest: skip users without a school email in `lib/server/groups.ts`.
4. **Contacts and invites:** the sponsored-guest flow becomes unnecessary. Hide "Guest access" in the nav.
5. **Abuse:** open sign-up needs rate limits and a captcha on `/api/auth/signup`, and a way to ban an account.
6. **Roles:** `/api/admin/users` still only lets school-email accounts hold host/director/admin roles. Keep that.
7. **iOS:** the app only accepts school emails; update `AuthManager` to match.
8. **Graduation year** gains an "Other" choice.

Turning it back: remove the variable and redeploy. Accounts that already have `openMember` keep access until you remove that claim.
