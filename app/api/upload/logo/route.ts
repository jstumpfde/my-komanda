import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.companyId) return NextResponse.json({ error: "No company" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Файл слишком большой (макс 2МБ)" }, { status: 400 })

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png"
  const allowedExts = ["png", "jpg", "jpeg", "svg", "webp"]
  if (!allowedExts.includes(ext)) return NextResponse.json({ error: "Формат не поддерживается" }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const dir = path.join(process.cwd(), "public", "uploads", "logos")
  await mkdir(dir, { recursive: true })

  const filename = `${session.user.companyId}.${ext}`
  const filepath = path.join(dir, filename)
  await writeFile(filepath, buffer)

  const logoUrl = `/uploads/logos/${filename}`

  await db
    .update(companies)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(companies.id, session.user.companyId))

  return NextResponse.json({ logoUrl })
}
