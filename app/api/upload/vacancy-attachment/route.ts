import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
])

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xlsx", "xls", "txt", "jpg", "jpeg", "png", "webp"])

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId || "default"

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (макс 20 МБ)" }, { status: 400 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: "Формат не поддерживается. Допустимы: PDF, DOCX, XLSX, TXT, JPG, PNG" }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const timestamp = Date.now()
  const safeName = file.name
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, "_")
    .slice(0, 100)
  const filename = `${timestamp}-${safeName}`

  const dir = path.join(process.cwd(), "public", "uploads", companyId, "attachments")
  await mkdir(dir, { recursive: true })

  const filepath = path.join(dir, filename)
  await writeFile(filepath, buffer)

  const url = `/uploads/${companyId}/attachments/${filename}`

  return NextResponse.json({
    url,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: new Date().toISOString(),
  })
}
