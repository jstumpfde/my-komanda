// Парсинг файлов, скачанных с подключённых источников (Яндекс.Диск и т.д.),
// в чистый текст — по образцу app/api/modules/knowledge/ai-courses/parse-file
// (те же библиотеки: pdf-parse/mammoth/xlsx). Отличие: работает с Buffer +
// имя/mimeType напрямую (не с multipart-запросом), т.к. вызывается из
// cron-синка, а не из HTTP-роута.

export interface ExtractOk {
  ok: true
  text: string
}
export interface ExtractSkipped {
  ok: false
  skipReason: string
}
export type ExtractResult = ExtractOk | ExtractSkipped

// Как ai-courses/parse-file — единый потолок размера файла для парсинга.
export const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB

const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "doc", "txt", "md", "xlsx", "xls"])

function extOf(name: string): string {
  const idx = name.lastIndexOf(".")
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase()
}

/** Быстрая проверка ДО скачивания/парсинга — по имени/размеру из метаданных провайдера. */
export function isSupportedFile(
  name: string,
  _mimeType: string | null,
  sizeBytes: number | null,
): { ok: true } | { ok: false; skipReason: string } {
  if (sizeBytes != null && sizeBytes > MAX_FILE_SIZE) {
    return { ok: false, skipReason: `Файл больше 15MB (${Math.round(sizeBytes / 1024 / 1024)}MB)` }
  }
  const ext = extOf(name)
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { ok: false, skipReason: `Формат .${ext || "?"} пока не поддерживается (нужны pdf/docx/xlsx/txt/md)` }
  }
  return { ok: true }
}

export async function extractText(buffer: Buffer, name: string, _mimeType: string | null): Promise<ExtractResult> {
  const ext = extOf(name)
  try {
    if (ext === "pdf") {
      const { PDFParse } = await import("pdf-parse")
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      const text = (result.text ?? "").trim()
      return text ? { ok: true, text } : { ok: false, skipReason: "Из PDF не удалось извлечь текст" }
    }
    if (ext === "docx" || ext === "doc") {
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ buffer })
      const text = (result.value ?? "").trim()
      return text ? { ok: true, text } : { ok: false, skipReason: "Из документа не удалось извлечь текст" }
    }
    if (ext === "xlsx" || ext === "xls") {
      const XLSX = await import("xlsx")
      const wb = XLSX.read(buffer, { type: "buffer" })
      const parts: string[] = []
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim()
        if (csv) parts.push(`## Лист: ${sheetName}\n${csv}`)
      }
      const text = parts.join("\n\n").trim()
      return text ? { ok: true, text } : { ok: false, skipReason: "Таблица пуста" }
    }
    if (ext === "txt" || ext === "md") {
      const text = buffer.toString("utf-8").trim()
      return text ? { ok: true, text } : { ok: false, skipReason: "Файл пуст" }
    }
    return { ok: false, skipReason: `Формат .${ext || "?"} не поддерживается` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse error"
    return { ok: false, skipReason: `Ошибка разбора: ${msg.slice(0, 200)}` }
  }
}
