import { NextRequest } from "next/server"
import { writeFile, unlink } from "fs/promises"
import path from "path"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/avatars")
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const targetUserId = (formData.get("userId") as string) || user.id

    if (!file) return apiError("Файл не выбран", 400)
    if (!ALLOWED_TYPES.includes(file.type)) return apiError("Формат: jpg, png, webp", 400)
    if (file.size > MAX_SIZE) return apiError("Максимум 2 МБ", 400)

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1]
    const filename = `${targetUserId}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(UPLOAD_DIR, filename), buffer)

    const avatarUrl = `/uploads/avatars/${filename}`

    // Delete old avatar file if exists
    const [existing] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, targetUserId!)).limit(1)
    if (existing?.avatarUrl) {
      const oldPath = path.join(process.cwd(), "public", existing.avatarUrl)
      await unlink(oldPath).catch(() => {})
    }

    await db.update(users).set({ avatarUrl }).where(eq(users.id, targetUserId!))

    return apiSuccess({ avatarUrl })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[team/avatar POST]", err)
    return apiError("Ошибка загрузки", 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { userId } = await req.json().catch(() => ({ userId: null })) as { userId?: string }
    const targetUserId = userId || user.id

    const [existing] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, targetUserId!)).limit(1)
    if (existing?.avatarUrl) {
      const filePath = path.join(process.cwd(), "public", existing.avatarUrl)
      await unlink(filePath).catch(() => {})
    }

    await db.update(users).set({ avatarUrl: null }).where(eq(users.id, targetUserId!))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[team/avatar DELETE]", err)
    return apiError("Ошибка удаления", 500)
  }
}
