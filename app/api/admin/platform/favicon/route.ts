// API загрузки фавикона для платформенного администратора.
// POST multipart/form-data: поле "file" + поле "slot" (light|dark|svg|apple).
// Сохраняет файл в public/uploads/platform/, возвращает URL.
// Авторизация: сессия + isPlatformAdminEmail.

import { NextRequest, NextResponse } from "next/server"
import { writeFile } from "fs/promises"
import { mkdirSync, existsSync } from "fs"
import path from "path"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { uploadsDir } from "@/lib/uploads-path"

const ALLOWED_MIME = ["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]
const ALLOWED_EXT  = ["png", "svg", "ico"]
const MAX_SIZE     = 512 * 1024 // 512 КБ — иконки маленькие

const VALID_SLOTS = ["light", "dark", "svg", "apple"] as const
type FaviconSlot = (typeof VALID_SLOTS)[number]

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!isPlatformAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get("file")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Файл не найден в поле 'file'" }, { status: 400 })
    }

    const slotRaw = (formData.get("slot") ?? "light") as string
    if (!VALID_SLOTS.includes(slotRaw as FaviconSlot)) {
      return NextResponse.json(
        { error: `Неверный slot. Допустимые: ${VALID_SLOTS.join(", ")}` },
        { status: 400 },
      )
    }
    const slot = slotRaw as FaviconSlot

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Файл слишком большой (макс ${Math.round(MAX_SIZE / 1024)} КБ)` },
        { status: 400 },
      )
    }

    // MIME-проверка
    const mime = file.type || ""
    if (!ALLOWED_MIME.includes(mime)) {
      return NextResponse.json(
        { error: `Формат не поддерживается. Разрешены: PNG, SVG, ICO` },
        { status: 400 },
      )
    }

    const filename0 = (file as File).name ?? "favicon"
    const ext = filename0.split(".").pop()?.toLowerCase() ?? "png"
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { error: `Расширение .${ext} не поддерживается. Разрешены: ${ALLOWED_EXT.join(", ")}` },
        { status: 400 },
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Директория public/uploads/platform/
    const dir = uploadsDir("platform")
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Имя файла: favicon-{slot}.{ext} — перезаписываем при повторной загрузке
    const safeFilename = `favicon-${slot}.${ext}`
    const filepath = path.join(dir, safeFilename)
    await writeFile(filepath, buffer)

    const url = `/uploads/platform/${safeFilename}?v=${Date.now()}`

    return NextResponse.json({ url, slot })
  } catch (err) {
    console.error("[api/admin/platform/favicon] error", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Ошибка загрузки: ${message}` }, { status: 500 })
  }
}
