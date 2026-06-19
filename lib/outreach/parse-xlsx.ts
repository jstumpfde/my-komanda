// Парсинг xlsx → заголовки + строки-объекты (использует уже установленный пакет xlsx).
import * as XLSX from "xlsx"
import type { RawRow } from "./types"

export interface ParsedSheet { headers: string[]; rows: RawRow[] }

const HEADER_HINT = /инн|компан|название|организац|наименован|оквэд/i

/** Распарсить первый лист. Сам находит строку заголовков (пропускает мусорные верхние). */
export function parseXlsx(buf: Buffer | ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buf, { type: buf instanceof Buffer ? "buffer" : "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { headers: [], rows: [] }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" })
  if (!aoa.length) return { headers: [], rows: [] }

  // Строка заголовков: первая из верхних 6, где ≥3 непустых ячеек и есть «ИНН/компания/…».
  let hi = 0
  for (let i = 0; i < Math.min(aoa.length, 6); i++) {
    const cells = (aoa[i] || []).map((c) => String(c ?? ""))
    const nonEmpty = cells.filter((c) => c.trim()).length
    if (nonEmpty >= 3 && cells.some((c) => HEADER_HINT.test(c))) { hi = i; break }
  }

  const headers = (aoa[hi] || []).map((c, idx) => String(c ?? "").trim() || `col${idx}`)
  const rows: RawRow[] = []
  for (let i = hi + 1; i < aoa.length; i++) {
    const arr = (aoa[i] || []) as unknown[]
    const obj: RawRow = {}
    let any = false
    headers.forEach((h, idx) => {
      const s = arr[idx] == null ? "" : String(arr[idx]).trim()
      if (s) any = true
      obj[h] = s
    })
    if (any) rows.push(obj)
  }
  return { headers, rows }
}
