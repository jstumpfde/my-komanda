import { NextRequest, NextResponse } from 'next/server'
import { requireCompany } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { text, voice, emotion, speed } = await req.json()
  if (!text) return NextResponse.json({ error: 'no text' }, { status: 400 })

  const params = new URLSearchParams({
    text,
    lang: 'ru-RU',
    voice:   voice   ?? 'alena',
    emotion: emotion ?? 'good',
    speed:   String(speed ?? 1.0),
    format: 'mp3',
    sampleRateHertz: '48000',
    folderId: process.env.YANDEX_FOLDER_ID!,
  })

  const resp = await fetch(
    'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize',
    {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${process.env.YANDEX_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: err }, { status: resp.status })
  }

  const audio = await resp.arrayBuffer()
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
