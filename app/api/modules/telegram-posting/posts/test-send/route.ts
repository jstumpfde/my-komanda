// POST { body, image_path? } — тестовая отправка ЧЕРНОВИКА поста себе в
// «Избранное» (Saved Messages), до постановки в очередь на реальные чаты.
// Ничего не пишет в БД — только реальная проверка, что вход/отправка работают.
import { NextRequest } from "next/server"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"
import { sendTestToSelf } from "@/lib/telegram-posting/sender"

export async function POST(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const body = await req.json().catch(() => ({}))

    const text = typeof body.body === "string" ? body.body : ""
    const imagePath = typeof body.image_path === "string" && body.image_path ? body.image_path : null
    if (!text.trim()) return apiError("Укажите текст поста", 400)

    await sendTestToSelf(user.id as string, text, imagePath)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/posts/test-send] POST", err)
    return apiError(err instanceof Error ? err.message : "Не удалось отправить тест", 500)
  }
}
