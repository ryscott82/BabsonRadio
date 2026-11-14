// The deployed version, for the booth's "Update available" button. Built once per deploy (force-static) and served from Vercel's
// CDN as a file, so checking it costs no function time. VERCEL_GIT_COMMIT_SHA is set by Vercel at build time.
export const dynamic = 'force-static'

export function GET() {
  return Response.json({ sha: process.env.VERCEL_GIT_COMMIT_SHA ?? '' })
}
