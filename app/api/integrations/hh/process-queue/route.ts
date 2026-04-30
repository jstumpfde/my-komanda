import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { processHhQueue } from "@/lib/hh/process-queue"

// In-process flag для DELETE /process-queue (кнопка «Остановить» в UI).
const stopFlags = new Map<string, boolean>()

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId
  const body = await req.json().catch(() => ({}))

  // dryRun / minScore / autoAction оставлены ради совместимости со старыми вызовами,
  // но AI-скоринг временно гейтится тумблером vacancy.aiScoringEnabled — параметры игнорируются.
  void body.dryRun
  void body.minScore
  void body.autoAction

  const result = await processHhQueue({
    companyId,
    localVacancyId:      typeof body.vacancyId === "string" ? body.vacancyId : undefined,
    limit:               typeof body.limit === "number" ? body.limit : undefined,
    delaySeconds:        body.delaySeconds != null ? Number(body.delaySeconds) : undefined,
    respectWorkingHours: false, // ручной запуск — без блока по времени
    stopFlags,
  })

  if (result.noToken) {
    return NextResponse.json({ error: "hh.ru не подключён" }, { status: 400 })
  }
  if (result.vacancyNotLinked) {
    return NextResponse.json({
      error: "Вакансия не привязана к hh.ru. Сначала установите связь в карточке вакансии.",
    }, { status: 400 })
  }
  if (result.processed === 0 && result.results.length === 0) {
    return NextResponse.json({ processed: 0, message: "Нет новых откликов" })
  }

  return NextResponse.json({
    processed:    result.processed,
    invited:      result.invited,
    rejected:     result.rejected,
    kept:         result.kept,
    delaySeconds: result.delaySeconds,
    results:      result.results,
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  stopFlags.set(session.user.companyId, true)
  return NextResponse.json({ stopped: true })
}
