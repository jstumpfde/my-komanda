// Загрузка обложки для архива Big Life — сохраняет файл прямо в
// assets/covers-archive статики biglife.company24.pro (см. lib/big-life/paths.ts)
// и возвращает относительный imagePath для записи в big_life_covers.
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { requireBigLifeAccess } from "@/lib/big-life/auth"
import { bigLifeCoversAssetsDir } from "@/lib/big-life/paths"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_SIZE = 15 * 1024 * 1024 // 15MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

export async function POST(req: NextRequest) {
  try {
    await requireBigLifeAccess()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Файл больше 15MB" }, { status: 400 })

  const ext = ALLOWED[file.type]
  if (!ext) return NextResponse.json({ error: "Разрешены только JPEG/PNG/WEBP" }, { status: 400 })

  try {
    const dir = bigLifeCoversAssetsDir()
    await mkdir(dir, { recursive: true })
    const fname = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(dir, fname), buf)
    return NextResponse.json({ imagePath: `assets/covers-archive/${fname}` })
  } catch (err) {
    console.error("[platform/big-life/covers/upload-image POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
