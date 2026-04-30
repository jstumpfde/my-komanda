import { NextResponse } from "next/server"

// Унифицированная проверка cron-эндпоинтов: header X-Cron-Secret должен
// совпадать с process.env.CRON_SECRET. Возвращает либо { ok: true },
// либо готовый Response с 403 — чтобы handler мог сразу его вернуть.
export function checkCronAuth(req: Request): { ok: true } | { ok: false; response: Response } {
  const secret = req.headers.get("X-Cron-Secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }
  return { ok: true }
}
