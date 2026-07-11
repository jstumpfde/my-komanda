// POST /api/modules/ai-rop/interactions/upload — ручная загрузка взаимодействия
// (текст переписки/письма или аудио встречи), multipart/form-data:
//   type:         "chat" | "email" | "meeting"
//   channel:      "whatsapp" | "telegram" | "email_imap" | "zoom" | "yandex_telemost" | "other" | "manual" | "dictaphone"
//   direction:    "in" | "out" | опционально
//   manager_id, client_phone, client_name, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id — опционально
//   started_at:   ISO timestamp (иначе now)
//   content_text: обязателен для chat/email или meeting-текста
//   file:         аудио для meeting (сохраняется в ROP_RECORDINGS_DIR/<companyId>/)
//
// Доступ: requireRopTeam (директор/head/rop_view_team — рядовой менеджер не
// грузит взаимодействия за других).
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { saveInteraction } from "@/lib/ai-rop/interaction-source"
import type { InteractionChannel, InteractionType } from "@/lib/ai-rop/types"

export const maxDuration = 120

const RECORDINGS_ROOT = process.env.ROP_RECORDINGS_DIR
  ? path.resolve(process.env.ROP_RECORDINGS_DIR)
  : path.join(process.cwd(), "storage", "rop-recordings")

const VALID_TYPES: InteractionType[] = ["chat", "email", "meeting"]
const VALID_CHANNELS: InteractionChannel[] = [
  "whatsapp", "telegram", "email_imap", "zoom", "yandex_telemost", "other", "manual", "dictaphone",
]
const ALLOWED_EXTS = new Set([".mp3", ".mp4", ".wav", ".m4a", ".ogg", ".aac", ".opus", ".webm", ".txt", ".pdf"])

export async function POST(req: Request) {
  try {
    const user = await requireRopTeam()

    const form = await req.formData().catch(() => null)
    if (!form) return apiError("Некорректный form-data", 400)

    const type = form.get("type") as InteractionType
    const channel = ((form.get("channel") as string) || "manual") as InteractionChannel
    const direction = (form.get("direction") as string) as "in" | "out" | null
    const managerId = (form.get("manager_id") as string) || null
    const clientPhone = (form.get("client_phone") as string) || null
    const bitrixDealId = (form.get("bitrix_deal_id") as string) || null
    const bitrixLeadId = (form.get("bitrix_lead_id") as string) || null
    const bitrixContactId = (form.get("bitrix_contact_id") as string) || null
    const startedAtRaw = (form.get("started_at") as string) || ""
    const contentText = (form.get("content_text") as string) || null
    const file = form.get("file") as File | null

    if (!VALID_TYPES.includes(type)) return apiError("type должен быть chat/email/meeting", 400)
    if (!VALID_CHANNELS.includes(channel)) return apiError("Неизвестный channel", 400)
    if (!contentText && !file) return apiError("Нужен content_text или file", 400)
    if (contentText && contentText.length > 200_000) return apiError("content_text слишком большой (макс. 200 000 символов)", 400)

    if (file) {
      const ext = path.extname(file.name || "").toLowerCase()
      if (ext && !ALLOWED_EXTS.has(ext)) return apiError(`Неподдерживаемый тип файла: ${ext}`, 400)
    }

    const externalId = crypto.randomBytes(8).toString("hex")

    let recordingPath: string | null = null
    if (file && type === "meeting") {
      const dir = path.join(RECORDINGS_ROOT, user.companyId)
      fs.mkdirSync(dir, { recursive: true })
      const ext = path.extname(file.name) || ".bin"
      const safeName = `${externalId}${ext}`
      recordingPath = path.join(dir, safeName)
      const buf = Buffer.from(await file.arrayBuffer())
      fs.writeFileSync(recordingPath, buf)
    }

    const callId = await saveInteraction({
      externalId,
      companyId: user.companyId,
      type,
      channel,
      direction,
      managerId,
      clientPhone,
      bitrixDealId,
      bitrixLeadId,
      bitrixContactId,
      startedAt: startedAtRaw || new Date().toISOString(),
      durationSec: 0,
      contentText,
      recordingUrl: null,
      initialStatus: "pending",
    })

    if (!callId) return apiError("Дубль (уже загружено)", 409)

    if (recordingPath) {
      await db.update(ropCalls).set({ recordingPath }).where(eq(ropCalls.id, callId))
    }

    return NextResponse.json({ ok: true, callId, type, channel })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/interactions/upload] error:", err)
    return apiError("Internal server error", 500)
  }
}
