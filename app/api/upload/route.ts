import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { writeFile, mkdir, unlink, stat } from "fs/promises"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { uploadsDir } from "@/lib/uploads-path"

// Загрузка медиа. Принимаем ЛЮБОЙ формат фото/видео/аудио. Форматы, которые
// браузер показывает напрямую (RENDERABLE), сохраняем как есть. Остальное
// (телефонные .mov/.heic, .avi, .mkv, .wmv, .tiff и т.п.) конвертируем на
// сервере: видео → mp4 (H.264/AAC), изображения → jpg, аудио → mp3. Конвертер —
// системные ffmpeg + heif-convert (libheif), шеллим как уже делаем с poppler в
// pdf-to-slides. Если бинаря нет / конвертация упала — сохраняем оригинал как
// есть (не хуже прежнего), загрузка не падает.
//
// Серверу нужны: `apt-get install -y ffmpeg libheif-examples` (heif-convert).
// Локально для теста: `brew install ffmpeg libheif`.

export const runtime = "nodejs"
export const maxDuration = 120

const execFileAsync = promisify(execFile)

// Прямо отображаемые/проигрываемые браузером форматы — сохраняем без изменений.
const RENDERABLE = new Set([
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

const MAX_SIZE = 200 * 1024 * 1024 // 200MB

function isAcceptedInput(type: string): boolean {
  if (RENDERABLE.has(type)) return true
  // Любое изображение/видео/аудио — даже если нерендеримое, сконвертируем.
  return type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")
}

function isMissingBinary(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId || "default"

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (макс 200МБ)" }, { status: 400 })
  }
  if (!isAcceptedInput(file.type)) {
    return NextResponse.json({ error: "Можно загружать изображения, видео, аудио или PDF" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const dir = uploadsDir(companyId)
  await mkdir(dir, { recursive: true })

  const timestamp = Date.now()
  const safeBase =
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, "_")
      .slice(0, 80) || "file"

  // 1) Браузер показывает напрямую. Фото/видео ДОПОЛНИТЕЛЬНО сжимаем на сервере
  //    (ffmpeg уже есть), чтобы не хранить и не отдавать тяжёлые оригиналы:
  //    фото → WebP q80 (ширина ≤1280), видео → H.264 -crf 28 (ширина ≤1280).
  //    GIF (анимация), аудио и PDF — как есть. При сбое ffmpeg ИЛИ если результат
  //    не меньше оригинала — сохраняем оригинал (загрузка не ломается).
  if (RENDERABLE.has(file.type)) {
    const origExt = (file.name.split(".").pop()?.toLowerCase() ?? "bin").replace(/[^a-z0-9]/g, "") || "bin"
    const isCompressibleImage = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp"
    const isCompressibleVideo = file.type === "video/mp4" || file.type === "video/webm"

    const saveOriginal = async () => {
      const filename = `${timestamp}-${safeBase}.${origExt}`
      await writeFile(path.join(dir, filename), buffer)
      return NextResponse.json({ url: `/uploads/${companyId}/${filename}`, filename: file.name, size: file.size, type: file.type })
    }

    if (isCompressibleImage || isCompressibleVideo) {
      const srcPath = path.join(dir, `${timestamp}-src-${safeBase}.${origExt}`)
      await writeFile(srcPath, buffer)
      const outName = isCompressibleImage ? `${timestamp}-${safeBase}.webp` : `${timestamp}-${safeBase}.mp4`
      const outPath = path.join(dir, outName)
      const outType = isCompressibleImage ? "image/webp" : "video/mp4"
      try {
        if (isCompressibleImage) {
          await execFileAsync("ffmpeg", ["-y", "-i", srcPath, "-vf", "scale='min(1280,iw)':-1", "-c:v", "libwebp", "-quality", "80", outPath], { timeout: 60_000 })
        } else {
          await execFileAsync("ffmpeg", ["-y", "-i", srcPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-vf", "scale='min(1280,iw)':-2", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outPath], { timeout: 110_000 })
        }
        const outStat = await stat(outPath).catch(() => null)
        await unlink(srcPath).catch(() => {})
        // Сжатый меньше оригинала → отдаём его, иначе откатываемся на оригинал.
        if (outStat && outStat.size > 0 && outStat.size < buffer.length) {
          return NextResponse.json({ url: `/uploads/${companyId}/${outName}`, filename: file.name, size: outStat.size, type: outType, compressed: true })
        }
        await unlink(outPath).catch(() => {})
        return await saveOriginal()
      } catch {
        await unlink(srcPath).catch(() => {})
        await unlink(outPath).catch(() => {})
        return await saveOriginal()
      }
    }

    // GIF / аудио / PDF — сохраняем как есть.
    return await saveOriginal()
  }

  // 2) Иначе — конвертируем. Исходник пишем с оригинальным расширением, чтобы
  //    ffmpeg/heif-convert корректно определили формат входа.
  const origExt = (file.name.split(".").pop()?.toLowerCase() ?? "bin").replace(/[^a-z0-9]/g, "") || "bin"
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image"
  const srcPath = path.join(dir, `${timestamp}-src-${safeBase}.${origExt}`)
  await writeFile(srcPath, buffer)

  try {
    let outName: string
    let outType: string

    if (kind === "image" && (file.type === "image/heic" || file.type === "image/heif")) {
      outName = `${timestamp}-${safeBase}.jpg`
      outType = "image/jpeg"
      try {
        await execFileAsync("heif-convert", ["-q", "90", srcPath, path.join(dir, outName)], { timeout: 60_000 })
      } catch (err) {
        if (isMissingBinary(err)) {
          // Нет libheif → запасной путь через ffmpeg (если он собран с libheif).
          await execFileAsync("ffmpeg", ["-y", "-i", srcPath, path.join(dir, outName)], { timeout: 60_000 })
        } else throw err
      }
    } else if (kind === "image") {
      outName = `${timestamp}-${safeBase}.jpg`
      outType = "image/jpeg"
      await execFileAsync("ffmpeg", ["-y", "-i", srcPath, path.join(dir, outName)], { timeout: 60_000 })
    } else if (kind === "audio") {
      outName = `${timestamp}-${safeBase}.mp3`
      outType = "audio/mpeg"
      await execFileAsync(
        "ffmpeg",
        ["-y", "-i", srcPath, "-c:a", "libmp3lame", "-q:a", "2", path.join(dir, outName)],
        { timeout: 120_000 },
      )
    } else {
      outName = `${timestamp}-${safeBase}.mp4`
      outType = "video/mp4"
      await execFileAsync(
        "ffmpeg",
        [
          "-y", "-i", srcPath,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart",
          path.join(dir, outName),
        ],
        { timeout: 110_000 },
      )
    }

    await unlink(srcPath).catch(() => {})
    return NextResponse.json({
      url: `/uploads/${companyId}/${outName}`,
      filename: file.name,
      size: file.size,
      type: outType,
      converted: true,
    })
  } catch {
    // Конвертер недоступен или упал — сохраняем оригинал как есть, чтобы
    // загрузка не падала (не хуже прежнего поведения). Safari проиграет .mov.
    const fallback = `${timestamp}-${safeBase}.${origExt}`
    try {
      await writeFile(path.join(dir, fallback), buffer)
      await unlink(srcPath).catch(() => {})
      return NextResponse.json({
        url: `/uploads/${companyId}/${fallback}`,
        filename: file.name,
        size: file.size,
        type: file.type,
        converted: false,
      })
    } catch {
      await unlink(srcPath).catch(() => {})
      return NextResponse.json({ error: "Не удалось обработать файл" }, { status: 500 })
    }
  }
}
