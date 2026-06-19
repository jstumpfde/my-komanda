import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { outreachImports } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireOutreachAccess } from "@/lib/outreach/access"
import { parseXlsx } from "@/lib/outreach/parse-xlsx"
import { detectSource, mapRow } from "@/lib/outreach/mappers"
import { mergeRows } from "@/lib/outreach/merge"

export const maxDuration = 300   // большие файлы — слияние построчно

// POST multipart: file=.xlsx → парс → распознавание источника → дедуп-слияние по ИНН.
export async function POST(req: NextRequest) {
  try {
    const user = await requireOutreachAccess()
    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return apiError("Файл не передан", 400)
    if (!file.name.toLowerCase().endsWith(".xlsx")) return apiError("Поддерживается только .xlsx", 400)

    const buf = Buffer.from(await file.arrayBuffer())
    const { headers, rows } = parseXlsx(buf)
    if (!rows.length) return apiError("Не найдено строк (пустой файл или нераспознанные заголовки)", 400)

    const source = detectSource(headers)

    const imp = await db.insert(outreachImports).values({
      companyId: user.companyId,
      filename: file.name,
      sourceType: source,
      status: "pending",
      rowsTotal: rows.length,
      mappingJson: { headers },
      createdBy: user.id ?? null,
    }).returning({ id: outreachImports.id })
    const importId = imp[0].id

    try {
      const unified = rows.map((r) => mapRow(source, r))
      const stats = await mergeRows({ companyId: user.companyId, importId, sourceType: source, file: file.name, rows: unified })
      await db.update(outreachImports).set({
        status: "done",
        rowsCreated: stats.created,
        rowsMerged: stats.merged,
        rowsSkipped: stats.skipped,
        contactsAdded: stats.contacts,
      }).where(eq(outreachImports.id, importId))
      return apiSuccess({ importId, source, ...stats })
    } catch (mergeErr) {
      await db.update(outreachImports).set({
        status: "error", error: (mergeErr as Error).message,
      }).where(eq(outreachImports.id, importId))
      throw mergeErr
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[email-marketing/import]", err)
    return apiError("Ошибка импорта: " + (err as Error).message, 500)
  }
}
