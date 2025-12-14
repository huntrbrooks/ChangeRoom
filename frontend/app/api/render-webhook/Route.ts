{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww18100\viewh19400\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import \{ NextRequest, NextResponse \} from 'next/server'\
\
const SHARED_SECRET = process.env.RENDER_WEBHOOK_SECRET\
\
const getToken = (req: NextRequest) => \{\
  const auth = req.headers.get('authorization') || ''\
  const bearer = auth.toLowerCase().startsWith('bearer ')\
    ? auth.slice(7).trim()\
    : null\
  return (\
    bearer ||\
    req.headers.get('x-render-token') ||\
    req.headers.get('x-render-signature')\
  )\
\}\
\
export async function POST(req: NextRequest) \{\
  // Optional shared-secret check\
  if (SHARED_SECRET) \{\
    const token = getToken(req)\
    if (!token || token !== SHARED_SECRET) \{\
      return NextResponse.json(\{ error: 'unauthorized' \}, \{ status: 401 \})\
    \}\
  \}\
\
  // Parse JSON safely\
  let body: any = null\
  try \{\
    body = await req.json()\
  \} catch \{\
    return NextResponse.json(\{ error: 'invalid json' \}, \{ status: 400 \})\
  \}\
\
  // Log a concise summary\
  const eventType = body?.type || body?.event || 'unknown'\
  const eventId = body?.id || body?.event_id || 'n/a'\
  console.log('Render webhook received', \{ eventType, eventId \})\
\
  return NextResponse.json(\{ ok: true \})\
\}\
\
// Reject non-POST\
export async function GET() \{\
  return NextResponse.json(\{ error: 'method not allowed' \}, \{ status: 405 \})\
\}}