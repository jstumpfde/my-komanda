import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { uploadsDir } from "@/lib/uploads-path"
import { mkdir, writeFile, readdir, rm } from "fs/promises"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { randomUUID } from "crypto"

// PDF-презентация: загруженный HR PDF растеризуется в картинки-слайды через
// poppler (pdftoppm). Картинки = «фото каждой страницы» → 100% точность
// вёрстки/шрифтов, ничего не «поедет». Кандидат листает их слайдером.
//
// Требует poppler-utils на сервере (pdftoppm + pdfinfo). На macOS — `brew install
// poppler`, на Ubuntu — `apt-get install -y poppler-utils`. Если бинарей нет,
// отдаём понятную 501-ошибку (не 500), чтобы UI показал внятный текст.

export const runtime = "nodejs"
export const maxDuration = 60

const execFileAsync = promisify(execFile)

const MAX_SIZE = 50 * 1024 * 1024 // 50 МБ
const MAX_PAGES = 100
const RENDER_DPI = 150

function isMissingBinary(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}

/** Парсит вывод pdfinfo: число страниц и соотношение сторон первой страницы. */
function parsePdfInfo(stdout: string): { pageCount: number; aspect: number } {
  let pageCount = 0
  let aspect = 16 / 9
  const pagesMatch = stdout.match(/^Pages:\s*(\d+)/m)
  if (pagesMatch) pageCount = parseInt(pagesMatch[1], 10)
  const sizeMatch = stdout.match(/^Page size:\s*([\d.]+)\s*x\s*([\d.]+)\s*pts/m)
  if (sizeMatch) {
    const w = parseFloat(sizeMatch[1])
    const h = parseFloat(sizeMatch[2])
    if (w > 0 && h > 0) aspect = w / h
  }
  return { pageCount, aspect }
}

export async function POST(req: NextRequest) {
  let companyId: string
  try {
    const user = await requireCompany()
    companyId = user.companyId
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  if (!isPdf) {
    return NextResponse.json({ error: "Нужен файл PDF" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "PDF слишком большой (максимум 50 МБ)" }, { status: 400 })
  }

  const id = randomUUID()
  const dir = uploadsDir(companyId, "pdf-slides", id)
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await mkdir(dir, { recursive: true })
    const srcPath = path.join(dir, "source.pdf")
    await writeFile(srcPath, buffer)

    // 1) Метаданные: число страниц + соотношение сторон.
    let pageCount = 0
    let aspect = 16 / 9
    try {
      const { stdout } = await execFileAsync("pdfinfo", [srcPath], { timeout: 30_000 })
      const info = parsePdfInfo(stdout)
      pageCount = info.pageCount
      aspect = info.aspect
    } catch (err) {
      if (isMissingBinary(err)) {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
        return NextResponse.json(
          { error: "На сервере не установлен конвертер PDF (poppler-utils). Обратитесь к администратору." },
          { status: 501 },
        )
      }
      // pdfinfo не критичен — продолжим без точного числа страниц.
    }

    if (pageCount > MAX_PAGES) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      return NextResponse.json(
        { error: `Слишком много страниц (${pageCount}). Максимум ${MAX_PAGES}.` },
        { status: 400 },
      )
    }

    // 2) Растеризация страниц в PNG: page-1.png, page-2.png, ...
    try {
      await execFileAsync(
        "pdftoppm",
        ["-png", "-r", String(RENDER_DPI), srcPath, path.join(dir, "page")],
        { timeout: 55_000, maxBuffer: 1024 * 1024 },
      )
    } catch (err) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      if (isMissingBinary(err)) {
        return NextResponse.json(
          { error: "На сервере не установлен конвертер PDF (poppler-utils). Обратитесь к администратору." },
          { status: 501 },
        )
      }
      return NextResponse.json({ error: "Не удалось обработать PDF" }, { status: 500 })
    }

    // 3) Собираем картинки страниц по порядку (pdftoppm зеро-падит при >=10 стр.).
    const files = (await readdir(dir))
      .filter((f) => /^page-\d+\.png$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10)
        const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10)
        return na - nb
      })

    if (files.length === 0) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      return NextResponse.json({ error: "PDF не содержит страниц" }, { status: 400 })
    }

    const base = `/uploads/${companyId}/pdf-slides/${id}`
    const pages = files.map((f) => `${base}/${f}`)

    return NextResponse.json({
      pdfUrl: `${base}/source.pdf`,
      pages,
      pageCount: pages.length,
      aspect,
      fileName: file.name,
    })
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    const message = err instanceof Error ? err.message : "Ошибка обработки PDF"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
