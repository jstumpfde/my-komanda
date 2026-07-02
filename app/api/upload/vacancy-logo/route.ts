import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { writeFile } from "fs/promises"
import { mkdirSync, existsSync } from "fs"
import path from "path"
import { uploadsDir } from "@/lib/uploads-path"

// Загрузка логотипа для брендинга вакансии.
// Доступно любому HR (не только директору, т.к. брендинг вакансии не компанийский).
// Файл сохраняется в uploads/logos/vac-{companyId}-{ts}.{ext}; URL хранится
// в descriptionJson.branding.logo вакансии (не обновляет companies).
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Файл не найден в поле 'file'" }, { status: 400 })
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл слишком большой (макс 2 МБ)" }, { status: 400 })
    }

    const filename0 = (file as File).name ?? "logo"
    const ext = filename0.split(".").pop()?.toLowerCase() ?? "png"
    // SVG исключён намеренно — stored XSS: инлайн-рендер SVG с публичного
    // /uploads исполняет вложенные скрипты. Растровые форматы безопасны.
    const allowedExts = ["png", "jpg", "jpeg", "webp"]
    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: `Формат .${ext} не поддерживается. Разрешены: ${allowedExts.join(", ")}` },
        { status: 400 }
      )
    }

    const dir = uploadsDir("logos")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const ts = Date.now()
    const safeFilename = `vac-${session.user.companyId}-${ts}.${ext}`
    const filepath = path.join(dir, safeFilename)

    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    const url = `/uploads/logos/${safeFilename}?v=${ts}`
    return NextResponse.json({ logoUrl: url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Ошибка загрузки: ${message}` }, { status: 500 })
  }
}
