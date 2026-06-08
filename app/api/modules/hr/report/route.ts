import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { buildReport, parsePeriod } from "@/lib/hr/build-report"

// Авторизованный отчёт по найму для текущей компании.
// Поддерживает ?period= и ?vacancyId= (конкретная вакания либо "all").
export async function GET(request: Request) {
  try {
    const user = await requireCompany()
    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get("period"))
    const vacancyId = url.searchParams.get("vacancyId")
    const fromRaw = url.searchParams.get("from")
    const toRaw = url.searchParams.get("to")
    const from = fromRaw ? new Date(fromRaw) : null
    const to = toRaw ? new Date(toRaw) : null

    const data = await buildReport(user.companyId, { period, vacancyId, from, to })
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) throw err
    console.error("[hr/report] GET error:", err)
    return apiError("Ошибка загрузки отчёта", 500)
  }
}
