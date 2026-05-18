import { authenticate }                        from '@/lib/server/middleware/authenticate.js'
import { getProjectFileTree, getBlobBytes }    from '@/lib/server/github.js'
import JSZip                                   from 'jszip'

export async function GET(request, { params }) {
  const user = await authenticate(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  const repo = new URL(request.url).searchParams.get('repo') ?? 'html-css-js'

  let files
  try {
    files = await getProjectFileTree(slug, repo)
  } catch {
    return Response.json({ error: 'Bad Gateway', message: 'Could not reach GitHub' }, { status: 502 })
  }

  if (files.length === 0) {
    return Response.json({ error: 'Not Found', message: 'Project not found or empty' }, { status: 404 })
  }

  const zip = new JSZip()
  try {
    await Promise.all(
      files.map(async ({ path, sha }) => {
        const bytes = await getBlobBytes(sha, repo)
        zip.file(path, bytes)
      })
    )
  } catch {
    return Response.json({ error: 'Bad Gateway', message: 'Could not fetch project files' }, { status: 502 })
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  return new Response(buffer, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${slug}.zip"`,
    },
  })
}
