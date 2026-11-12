import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { deleteRecording } from '@/lib/server/recordings'

export const runtime = 'nodejs'

// Delete a recording (the owner, or E-board and Admin): removes the file from AzuraCast (best effort), its one-time playlist, and the link from the show.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const t = await requireMember(req)
    const { id } = await params
    const a = await accessOf(t)
    return deleteRecording(adminDb(), id, { uid: t.uid, staff: a.level === 'director' || a.level === 'admin' })
  })
}
