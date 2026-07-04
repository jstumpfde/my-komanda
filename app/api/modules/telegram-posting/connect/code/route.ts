// Шаг 2 подключения Telegram-аккаунта: подтверждение кода из Telegram.
import { NextRequest } from "next/server"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"
import { confirmCode } from "@/lib/telegram-posting/auth"

export async function POST(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const body = await req.json().catch(() => ({}))
    const code = typeof body.code === "string" ? body.code.trim() : ""
    if (!code) return apiError("Укажите код из Telegram", 400)

    const result = await confirmCode(user.id as string, code)
    return apiSuccess({ ok: true, need2fa: result.need2fa })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/connect/code] POST", err)
    return apiError(err instanceof Error ? err.message : "Не удалось подтвердить код", 500)
  }
}
