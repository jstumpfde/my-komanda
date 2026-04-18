// app/api/companies/demo-profile/photo/route.ts
// Загрузка/удаление фото руководителя для профиля демонстраций.
// Файлы сохраняются в public/uploads/ceo-photos/
// URL записывается в companies.demoProfile.ceoPhotoUrl

import { NextRequest } from "next/server"
import { writeFile, unlink, mkdir } from "fs/promises"
import path from "path"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/ceo-photos")
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

type DemoProfile = Record<string, string>

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) return apiError("Файл не выбран", 400)
    if (!ALLOWED_TYPES.includes(file.type)) return apiError("Формат: jpg, png, webp", 400)
    if (file.size > MAX_SIZE) return apiError("Максимум 5 МБ", 400)

    // Создаём директорию если нет
    await mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {})

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1]
    const filename = `${user.companyId}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(UPLOAD_DIR, filename), buffer)

    const ceoPhotoUrl = `/uploads/ceo-photos/${filename}`

    // Загружаем текущий профиль чтобы не стереть остальные поля
    const [existing] = await db
      .select({ demoProfile: companies.demoProfile })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const currentProfile = ((existing?.demoProfile as DemoProfile) || {}) as DemoProfile

    // Удаляем старое фото если оно было загружено у нас
    const oldUrl = currentProfile.ceoPhotoUrl
    if (oldUrl && oldUrl.startsWith("/uploads/ceo-photos/")) {
      const oldPath = path.join(process.cwd(), "public", oldUrl)
      await unlink(oldPath).catch(() => {})
    }

    // Обновляем профиль
    const newProfile: DemoProfile = {
      ...currentProfile,
      ceoPhotoUrl,
      updatedAt: new Date().toISOString(),
    }

    await db
      .update(companies)
      .set({ demoProfile: newProfile })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ ceoPhotoUrl })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[companies/demo-profile/photo POST]", err)
    return apiError("Ошибка загрузки", 500)
  }
}

export async function DELETE() {
  try {
    const user = await requireCompany()

    const [existing] = await db
      .select({ demoProfile: companies.demoProfile })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const currentProfile = ((existing?.demoProfile as DemoProfile) || {}) as DemoProfile
    const oldUrl = currentProfile.ceoPhotoUrl

    if (oldUrl && oldUrl.startsWith("/uploads/ceo-photos/")) {
      const oldPath = path.join(process.cwd(), "public", oldUrl)
      await unlink(oldPath).catch(() => {})
    }

    const newProfile: DemoProfile = {
      ...currentProfile,
      ceoPhotoUrl: "",
      updatedAt: new Date().toISOString(),
    }

    await db
      .update(companies)
      .set({ demoProfile: newProfile })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[companies/demo-profile/photo DELETE]", err)
    return apiError("Ошибка удаления", 500)
  }
}
