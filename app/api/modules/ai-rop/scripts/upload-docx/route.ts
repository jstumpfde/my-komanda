/**
 * POST /api/modules/ai-rop/scripts/upload-docx — извлечь текст скрипта из
 * .docx для заполнения поля content_md формы скрипта (перенесено из
 * call-agent, app/api/scripts/upload-docx, план п.12).
 *
 * multipart/form-data: file=<docx>. Доступ — requireRopManage (директор),
 * как и остальное управление скриптами/чек-листами.
 */
import { NextRequest, NextResponse } from "next/server"
import mammoth from "mammoth"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    await requireRopManage()
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/scripts/upload-docx] auth error:", err)
    return apiError("Internal server error", 500)
  }

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return apiError("file required", 400)
  }
  if (file.size > 5_000_000) {
    return apiError("файл слишком большой (>5MB)", 413)
  }
  if (!/\.docx$/i.test(file.name)) {
    return apiError("только .docx", 415)
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value.trim()
    return NextResponse.json({ ok: true, text, fileName: file.name })
  } catch (e) {
    console.error("[ai-rop/scripts/upload-docx] extract failed:", e)
    return apiError((e as Error).message || "Не удалось прочитать файл", 500)
  }
}
