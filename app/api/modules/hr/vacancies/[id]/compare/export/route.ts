// GET /api/modules/hr/vacancies/[id]/compare/export?ids=... → .xlsx сравнения.
// Настоящий Excel-файл (а не CSV) — открывается нативно, без проблем с
// разделителем/кодировкой на Mac.
import * as XLSX from "xlsx"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { buildComparison, type CompareAns } from "@/lib/compare/build-comparison"

const MAX_COMPARE = 50

function cell(a?: CompareAns): string {
  if (!a) return ""
  const parts: string[] = []
  if (typeof a.awarded === "number") parts.push(`[${a.awarded} б${a.correct === false ? ", неверно" : a.correct ? ", верно" : ""}]`)
  if (a.value) parts.push(a.value.split("|||").map((s) => s.trim()).filter(Boolean).join("; "))
  return parts.join(" ")
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await ctx.params
    const url = new URL(req.url)
    const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE)
    if (ids.length === 0) return apiError("ids required", 400)

    const [vac] = await db
      .select({ companyId: vacancies.companyId, title: vacancies.title })
      .from(vacancies).where(eq(vacancies.id, vacancyId)).limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (vac.companyId !== user.companyId) return apiError("Forbidden", 403)

    const { candidates, sections } = await buildComparison(vacancyId, ids)
    if (candidates.length === 0) return apiError("No candidates", 404)

    const header = ["Вопрос", ...candidates.map((c) => {
      const bits: string[] = []
      if (c.resumeScore != null) bits.push(`резюме ${c.resumeScore}`)
      if (c.demoPercent != null) bits.push(`демо ${c.demoPercent}%`)
      if (c.testScore != null) bits.push(`тест ${c.testScore}`)
      return `${c.name?.trim() || "Без имени"}${bits.length ? ` (${bits.join(" | ")})` : ""}`
    })]
    const aoa: (string)[][] = [header]
    for (const section of sections) {
      aoa.push([section.title.toUpperCase()])
      for (const q of section.questions) {
        aoa.push([q.text, ...candidates.map((c) => cell(section.answers[c.id]?.[q.id]))])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 40 }, ...candidates.map(() => ({ wch: 34 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Сравнение")
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    const fileName = `Сравнение — ${(vac.title || "вакансия").slice(0, 60)}.xlsx`
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="compare.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
