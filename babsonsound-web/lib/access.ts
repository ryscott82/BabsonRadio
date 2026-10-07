// Who can sign up as a full member.
//   school (default): Babson, Olin and Wellesley emails, beta testers, and sponsored/trial guests.
//   public: anyone with a verified email becomes a member. Flip with NEXT_PUBLIC_ACCESS_MODE=public.
// See PUBLIC_MODE.md for everything to check before flipping it.
export const PUBLIC_ACCESS = process.env.NEXT_PUBLIC_ACCESS_MODE === 'public'
