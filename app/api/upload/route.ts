import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "application/pdf",
])

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId || "default"

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (макс 50МБ)" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Формат не поддерживается" }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin"
  const timestamp = Date.now()
  const safeName = file.name
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, "_")
    .slice(0, 100)
  const filename = `${timestamp}-${safeName}`

  const dir = path.join(process.cwd(), "public", "uploads", companyId)
  await mkdir(dir, { recursive: true })

  const filepath = path.join(dir, filename)
  await writeFile(filepath, buffer)

  const url = `/uploads/${companyId}/${filename}`

  return NextResponse.json({
    url,
    filename: file.name,
    size: file.size,
    type: file.type,
  })
}
