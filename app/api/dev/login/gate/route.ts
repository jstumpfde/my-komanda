import { NextRequest, NextResponse } from "next/server"

// POST /api/dev/login/gate — принимает { key } в теле. Если совпадает с
// DEV_LOGIN_KEY, ставит httpOnly cookie `dev_login_key` (чтобы последующие
// запросы к /api/dev/login проходили без query-параметра).

export async function POST(req: NextRequest) {
  const envKey = process.env.DEV_LOGIN_KEY
  if (!envKey) {
    return NextResponse.json({ error: "DEV_LOGIN_KEY не настроен на сервере" }, { status: 503 })
  }

  let body: { key?: string }
  try {
    body = await req.json() as { key?: string }
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
  }

  if (!body.key || body.key !== envKey) {
    return NextResponse.json({ error: "Неверный ключ" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set("dev_login_key", envKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 дней
  })
  return res
}
