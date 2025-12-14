import { NextRequest, NextResponse } from 'next/server'

const SHARED_SECRET = process.env.RENDER_WEBHOOK_SECRET

const getToken = (req: NextRequest) => {
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : null
  return bearer || req.headers.get('x-render-token') || req.headers.get('x-render-signature')
}

export async function POST(req: NextRequest) {
  if (SHARED_SECRET) {
    const token = getToken(req)
    if (!token || token !== SHARED_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const typed = body as { type?: string; event?: string; id?: string; event_id?: string }
  const eventType = typed?.type || typed?.event || 'unknown'
  const eventId = typed?.id || typed?.event_id || 'n/a'
  console.log('Render webhook received', { eventType, eventId })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 })
}
