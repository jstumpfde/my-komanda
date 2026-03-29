/**
 * Утилита извлечения текста из файлов разных форматов
 */

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase()

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return buffer.toString("utf-8")
  }

  if (lower.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse")
      const data = await pdfParse(buffer)
      return data.text || ""
    } catch {
      throw new Error("Ошибка при чтении PDF файла")
    }
  }

  if (lower.endsWith(".docx")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth")
      const result = await mammoth.extractRawText({ buffer })
      return result.value || ""
    } catch {
      throw new Error("Ошибка при чтении DOCX файла")
    }
  }

  if (lower.endsWith(".pptx")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const JSZip = require("jszip")
      const zip = await JSZip.loadAsync(buffer)
      const texts: string[] = []

      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
        .sort()

      for (const slideFile of slideFiles) {
        const content = await zip.files[slideFile].async("text")
        // Извлечь текст из тегов <a:t>
        const matches = content.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)
        for (const match of matches) {
          const text = match[1].trim()
          if (text) texts.push(text)
        }
      }

      return texts.join("\n")
    } catch {
      // jszip может быть не установлен
      return "PPTX parsing not supported yet"
    }
  }

  throw new Error("Формат не поддерживается. Допустимые форматы: PDF, DOCX, PPTX, TXT, MD")
}
