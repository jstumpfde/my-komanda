import { NextResponse } from "next/server"

export async function GET() {
  const clientId = process.env.HH_CLIENT_ID
  const redirectUri = process.env.HH_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "hh.ru не настроен" }, { status: 500 })
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
  })

  const hhAuthUrl = `https://hh.ru/oauth/authorize?${params.toString()}`
  return NextResponse.redirect(hhAuthUrl)
}
