import { adminDb } from '@/lib/server/admin'
import { handle, requireStaff } from '@/lib/server/http'
import { allBirthdays } from '@/lib/server/birthdays'

export const runtime = 'nodejs'

// Master list of the birthdays people chose to share (month and day only).
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    return { people: await allBirthdays(adminDb()) }
  })
}
