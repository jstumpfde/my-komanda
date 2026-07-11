// Смета AI-токенов ДО старта индексации — показывается в UI перед
// подтверждением (концепт kb-connected-sources §ux: «оценка расхода
// AI-токенов ДО старта … "~85 000 токенов из вашего лимита 2 млн"»).
// Грубая: sizeBytes → предполагаемый текст → токены. НЕ открываем/не парсим
// файлы для сметы (это была бы уже сама индексация) — оцениваем по размеру и
// типу через метаданные листинга (SourceFileMeta), которые уже есть после
// краула дерева папок.

import type { SourceFileMeta } from "./adapter-types"
import { isSupportedFile } from "./extract"

// Эмпирические коэффициенты "полезный текст / байты файла" по формату —
// office-контейнеры несут разметку/сжатие поверх текста, поэтому доля
// извлекаемого текста ниже, чем у обычного текстового файла.
const TEXT_YIELD_RATIO: Record<string, number> = {
  pdf: 0.5,
  docx: 0.4,
  doc: 0.4,
  xlsx: 0.3,
  xls: 0.3,
  txt: 0.95,
  md: 0.95,
}

const CHARS_PER_TOKEN = 3.5

function extOf(name: string): string {
  const idx = name.lastIndexOf(".")
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase()
}

export interface IndexingEstimate {
  totalFiles: number
  supportedFiles: number
  skippedFiles: number
  estimatedChars: number
  estimatedTokens: number
}

export function estimateIndexing(
  files: Pick<SourceFileMeta, "name" | "mimeType" | "sizeBytes">[],
): IndexingEstimate {
  let supportedFiles = 0
  let skippedFiles = 0
  let estimatedChars = 0

  for (const f of files) {
    const check = isSupportedFile(f.name, f.mimeType, f.sizeBytes)
    if (!check.ok) { skippedFiles++; continue }
    supportedFiles++
    const ratio = TEXT_YIELD_RATIO[extOf(f.name)] ?? 0.4
    estimatedChars += Math.round((f.sizeBytes ?? 0) * ratio)
  }

  return {
    totalFiles: files.length,
    supportedFiles,
    skippedFiles,
    estimatedChars,
    // ×1.15 — небольшой запас: первый прогон почти всегда переэмбеддит чуть
    // больше, чем "голый" текст (разбиение по чанкам округляется вверх).
    estimatedTokens: Math.round((estimatedChars / CHARS_PER_TOKEN) * 1.15),
  }
}
