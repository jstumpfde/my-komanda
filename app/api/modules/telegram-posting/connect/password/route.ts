// Шаг 3 подключения Telegram-аккаунта: пароль облачного 2FA (только если запрошен).
import { NextRequest } from "next/server"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"
import { confirmPassword } from "@/lib/telegram-posting/auth"

export async function POST(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const body = await req.json().catch(() => ({}))
    const password = typeof body.password === "string" ? body.password : ""
    if (!password) return apiError("Укажите пароль двухфакторной аутентификации", 400)

    await confirmPassword(user.id as string, password)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/connect/password] POST", err)
    return apiError(err instanceof Error ? err.message : "Неверный пароль", 500)
  }
}
