import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { writeFile } from "fs/promises"
import { mkdirSync, existsSync } from "fs"
import path from "path"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.user.companyId) {
      return NextResponse.json({ error: "No company" }, { status: 403 })
    }

    // Parse multipart — если content-type не multipart, .formData() кинет
    // внятную ошибку, её ловим в общем catch ниже
    const formData = await req.formData()
    const file = formData.get("file")
    if (!(file instanceof Blob)) {
      console.error("[upload/logo] no file in form data")
      return NextResponse.json({ error: "Файл не найден в поле 'file'" }, { status: 400 })
    }
    // variant: "light" (default, основной логотип) | "dark" (для тёмных фонов — sidebar)
    const variantRaw = (formData.get("variant") ?? "light") as string
    const variant: "light" | "dark" = variantRaw === "dark" ? "dark" : "light"

    const filename0 = (file as File).name ?? "logo"
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл слишком большой (макс 2МБ)" }, { status: 400 })
    }

    const ext = filename0.split(".").pop()?.toLowerCase() ?? "png"
    const allowedExts = ["png", "jpg", "jpeg", "svg", "webp"]
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: `Формат .${ext} не поддерживается. Разрешены: ${allowedExts.join(", ")}` }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Директория — на проде (standalone build) public не writable. Используем
    // cwd/public/uploads/logos и создаём рекурсивно. На проде Timeweb это
    // путь к смонтированному тому.
    const dir = path.join(process.cwd(), "public", "uploads", "logos")
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    } catch (mkErr) {
      console.error("[upload/logo] mkdir failed", { dir, error: mkErr })
      return NextResponse.json(
        { error: `Не удалось создать папку для загрузки: ${(mkErr as Error).message}` },
        { status: 500 },
      )
    }

    const suffix = variant === "dark" ? "-dark" : ""
    const safeFilename = `${session.user.companyId}${suffix}.${ext}`
    const filepath = path.join(dir, safeFilename)

    try {
      await writeFile(filepath, buffer)
    } catch (writeErr) {
      console.error("[upload/logo] writeFile failed", { filepath, error: writeErr })
      return NextResponse.json(
        { error: `Не удалось записать файл: ${(writeErr as Error).message}` },
        { status: 500 },
      )
    }

    // Cache-buster в URL, чтобы браузер не показывал старую версию
    const url = `/uploads/logos/${safeFilename}?v=${Date.now()}`

    try {
      const patch = variant === "dark"
        ? { logoDarkUrl: url, updatedAt: new Date() }
        : { logoUrl: url, updatedAt: new Date() }
      await db
        .update(companies)
        .set(patch)
        .where(eq(companies.id, session.user.companyId))
    } catch (dbErr) {
      console.error("[upload/logo] DB update failed", dbErr)
      return NextResponse.json(
        { error: "Файл сохранён, но не удалось обновить БД" },
        { status: 500 },
      )
    }

    console.log("[upload/logo] success", { companyId: session.user.companyId, variant, url, size: file.size })
    // Возвращаем оба поля (один заполнен, второй null) для совместимости
    // со старым клиентом, который читает только logoUrl.
    return NextResponse.json(
      variant === "dark"
        ? { logoDarkUrl: url }
        : { logoUrl: url },
    )
  } catch (err) {
    console.error("[upload/logo] unexpected error", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Ошибка загрузки: ${message}` }, { status: 500 })
  }
}
