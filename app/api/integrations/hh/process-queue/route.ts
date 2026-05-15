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

  // UUID-валидация vacancyId: drizzle бросает ошибку с регекс-сообщением,
  // если попытаться передать невалидную строку в WHERE eq(uuid_col, ...).
  // Возвращаем чистый 400 вместо 500.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const rawVacancyId = typeof body.vacancyId === "string" ? body.vacancyId : null
  const vacancyId = rawVacancyId && UUID_RE.test(rawVacancyId) ? rawVacancyId : undefined

  // Коэрция чисел: клиент мог прислать строку, undefined или NaN.
  const toFiniteNumber = (v: unknown): number | undefined => {
    if (v == null) return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const limit        = toFiniteNumber(body.limit)
  const delaySeconds = toFiniteNumber(body.delaySeconds)

  const result = await processHhQueue({
    companyId,
    localVacancyId:      vacancyId,
    limit,
    delaySeconds,
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
