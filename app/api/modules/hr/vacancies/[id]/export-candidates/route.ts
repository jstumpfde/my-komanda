import { NextRequest } from "next/server"
import { eq, and, ne, or, isNull, inArray, desc, type SQL } from "drizzle-orm"
import * as XLSX from "xlsx"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { deriveCandidateName } from "@/lib/candidate-name"
import { pickGivenName } from "@/lib/messaging/candidate-name"
import { getLearnedNamesSet } from "@/lib/messaging/learned-given-names"
import { logAudit, ipFromRequest } from "@/lib/audit/log"
import { DEFAULT_TEST_INVITE_TEXT } from "@/lib/messaging/test-invite"

// GET  /api/modules/hr/vacancies/[id]/export-candidates
//   — выгружает ВСЕХ кандидатов вакансии со ВСЕМИ полями (обратная совместимость,
//     прямая ссылка-скачивание).
// POST /api/modules/hr/vacancies/[id]/export-candidates
//   body: { scope: "all"|"selected"|"status", candidateIds?, statuses?, fields? }
//   — полноценная выгрузка с выбором охвата и набора колонок.

interface DemoBlock { blockId?: string; status?: string }
interface LessonShape { blocks?: { id?: string }[] }

// ─── hh raw_data contact types ───────────────────────────────────────────────
interface HhContactValue {
  formatted?: string
  email?: string
  number?: string
}
interface HhContact {
  type?: { id?: string; name?: string }
  value?: string | HhContactValue
  preferred?: boolean
}
interface HhSite {
  type?: { id?: string; name?: string }
  url?: string
}
interface HhResume {
  contact?: HhContact[]
  site?: HhSite[]
}
interface HhRawData {
  resume?: HhResume
}

// ─── Вспомогательные функции для hh контактов ────────────────────────────────

/** Извлечь строку-значение из HhContact.value */
function extractContactValue(v: string | HhContactValue | undefined): string {
  if (!v) return ""
  if (typeof v === "string") return v.trim()
  return (
    (typeof v.email === "string" && v.email.trim()) ||
    (typeof v.formatted === "string" && v.formatted.trim()) ||
    (typeof v.number === "string" && v.number.trim()) ||
    ""
  )
}

/** Собрать все телефоны из raw.resume.contact[] */
function extractAllPhones(raw: HhRawData | null): string {
  const contacts = raw?.resume?.contact
  if (!Array.isArray(contacts)) return ""
  const phones: string[] = []
  for (const c of contacts) {
    const id = c?.type?.id
    if (!id || !["cell", "phone", "home", "work"].includes(id)) continue
    const val = extractContactValue(c.value)
    if (val) phones.push(val)
  }
  return phones.join(", ")
}

/** Извлечь email из raw.resume.contact[] */
function extractHhEmail(raw: HhRawData | null): string {
  const contacts = raw?.resume?.contact
  if (!Array.isArray(contacts)) return ""
  for (const c of contacts) {
    if (c?.type?.id !== "email") continue
    const val = extractContactValue(c.value)
    if (val) return val
  }
  return ""
}

/** Извлечь Telegram из raw.resume.contact[] */
function extractHhTelegram(raw: HhRawData | null): string {
  const contacts = raw?.resume?.contact
  if (!Array.isArray(contacts)) return ""
  for (const c of contacts) {
    if (c?.type?.id !== "telegram") continue
    const val = extractContactValue(c.value)
    if (val) return val
  }
  return ""
}

/** WhatsApp из raw.resume.contact[] */
function extractHhWhatsapp(raw: HhRawData | null): string {
  const contacts = raw?.resume?.contact
  if (!Array.isArray(contacts)) return ""
  for (const c of contacts) {
    if (c?.type?.id !== "whatsapp") continue
    const val = extractContactValue(c.value)
    if (val) return val
  }
  return ""
}

/** Прочие мессенджеры/ссылки из raw.resume.contact[] (Skype, MAX и т.п.) и raw.resume.site[] */
function extractHhOtherLinks(raw: HhRawData | null): string {
  const parts: string[] = []
  const contacts = raw?.resume?.contact
  const skip = new Set(["cell", "phone", "home", "work", "email", "telegram", "whatsapp"])
  if (Array.isArray(contacts)) {
    for (const c of contacts) {
      const id = c?.type?.id
      if (!id || skip.has(id)) continue
      const name = c?.type?.name || id
      const val = extractContactValue(c.value)
      if (val) parts.push(`${name}: ${val}`)
    }
  }
  const sites = raw?.resume?.site
  if (Array.isArray(sites)) {
    for (const s of sites) {
      if (s?.url) {
        const label = s.type?.name || s.type?.id || "Ссылка"
        parts.push(`${label}: ${s.url}`)
      }
    }
  }
  return parts.join("; ")
}

/**
 * Предпочтительный способ связи.
 * Ищем контакт с preferred=true в raw.resume.contact[].
 * Возвращаем строку вида «Телефон: +7…» или «Email: …» или пусто.
 */
function extractPreferredContact(raw: HhRawData | null): string {
  const contacts = raw?.resume?.contact
  if (!Array.isArray(contacts)) return ""
  for (const c of contacts) {
    if (!c?.preferred) continue
    const id = c?.type?.id
    const name = c?.type?.name || id || "Контакт"
    const val = extractContactValue(c.value)
    if (val) return `${name}: ${val}`
    return name
  }
  return ""
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function extractBirthDate(birthDate: string | Date | null, anketa: unknown): string | null {
  if (birthDate) {
    const s = birthDate instanceof Date ? birthDate.toISOString() : String(birthDate)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  }
  if (anketa && typeof anketa === "object" && !Array.isArray(anketa)) {
    const obj = anketa as Record<string, unknown>
    for (const k of ["birthDate", "birth_date", "birthday"]) {
      const v = obj[k]
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
    }
  }
  return null
}

function ageFromBirthDate(iso: string | null): number | null {
  if (!iso) return null
  const bd = new Date(iso)
  if (Number.isNaN(bd.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - bd.getFullYear()
  const m = now.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

function currencySymbol(code: string | null | undefined): string {
  if (!code) return "₽"
  const c = code.toUpperCase()
  if (c === "RUR" || c === "RUB") return "₽"
  if (c === "EUR") return "€"
  if (c === "USD") return "$"
  if (c === "GBP") return "£"
  return c
}

function formatSalary(min: number | null, max: number | null, cur: string | null): string {
  const sym = currencySymbol(cur)
  const fmt = (n: number) => n.toLocaleString("ru-RU")
  if (min && max) return min === max ? `${fmt(min)} ${sym}` : `${fmt(min)}–${fmt(max)} ${sym}`
  if (min) return `от ${fmt(min)} ${sym}`
  if (max) return `до ${fmt(max)} ${sym}`
  return ""
}

const STAGE_LABELS: Record<string, string> = {
  new: "Новый", primary_contact: "Первичный контакт", demo: "Демо",
  demo_opened: "Демо открыто", anketa_filled: "Анкета заполнена", decision: "Демо пройдено",
  ai_screening: "AI-скрининг", test_task_sent: "Тестовое отправлено", test_task_done: "Тестовое выполнено",
  scheduled: "Назначено интервью", interview: "Интервью", interviewed: "Интервью пройдено",
  reference_check: "Проверка рекомендаций", offer_sent: "Оффер отправлен", offer: "Оффер",
  final_decision: "Финальное решение", hired: "Нанят", rejected: "Отказ", talent_pool: "Кадровый резерв",
}

// Контекст для вычисления значения колонки по строке кандидата.
interface RowCtx {
  hhName: string | null
  hhResumeUrl: string | null
  birth: string | null
  age: number | null
  progress: string
  raw: HhRawData | null
  testLink: string
  personalMessage: string
}

// Каталог колонок — единый источник правды для GET, POST и клиентского диалога.
// key — стабильный идентификатор поля (его шлёт клиент в fields[]).
type CandRow = typeof candidates.$inferSelect
const COLUMN_DEFS: Array<{
  key: string
  header: string
  width: number
  value: (c: CandRow, ctx: RowCtx) => string | number
}> = [
  { key: "fio",              header: "ФИО",                           width: 28, value: (c, x) => deriveCandidateName(c.name, c.anketaAnswers, x.hhName) },
  { key: "birthDate",        header: "Дата рождения",                 width: 14, value: (_c, x) => x.birth ? new Date(x.birth).toLocaleDateString("ru-RU") : "" },
  { key: "age",              header: "Возраст",                       width: 8,  value: (_c, x) => x.age ?? "" },
  { key: "city",             header: "Город",                         width: 18, value: (c) => c.city ?? "" },
  { key: "salary",           header: "Зарплата",                      width: 18, value: (c) => formatSalary(c.salaryMin, c.salaryMax, c.salaryCurrency) },
  { key: "responseDate",     header: "Дата отклика",                  width: 13, value: (c) => c.createdAt ? new Date(c.createdAt).toLocaleDateString("ru-RU") : "" },
  { key: "resumeScore",      header: "Портрет",                       width: 10, value: (c) => c.resumeScore ?? "" },
  { key: "aiScore",          header: "AI-оценка",                     width: 10, value: (c) => c.aiScore ?? "" },
  { key: "demoProgress",     header: "Прогресс демо",                 width: 12, value: (_c, x) => x.progress },
  { key: "stage",            header: "Этап воронки",                  width: 20, value: (c) => c.stage ? (STAGE_LABELS[c.stage] ?? c.stage) : "" },
  { key: "source",           header: "Источник",                      width: 12, value: (c) => c.source ?? "" },
  { key: "resumeUrl",        header: "Резюме hh",                     width: 36, value: (_c, x) => x.hhResumeUrl ?? "" },
  // Базовые контакты (из candidates)
  { key: "phone",            header: "Телефон",                       width: 16, value: (c) => c.phone ?? "" },
  { key: "email",            header: "Email",                         width: 26, value: (c) => c.email ?? "" },
  // Расширенные контакты из hh raw_data
  { key: "hhPhones",         header: "Телефоны (hh)",                 width: 30, value: (_c, x) => extractAllPhones(x.raw) },
  { key: "hhEmail",          header: "Email (hh)",                    width: 26, value: (_c, x) => extractHhEmail(x.raw) },
  { key: "hhTelegram",       header: "Telegram (hh)",                 width: 22, value: (_c, x) => extractHhTelegram(x.raw) },
  { key: "hhWhatsapp",       header: "WhatsApp (hh)",                 width: 22, value: (_c, x) => extractHhWhatsapp(x.raw) },
  { key: "hhOtherLinks",     header: "Прочие контакты/ссылки (hh)",   width: 40, value: (_c, x) => extractHhOtherLinks(x.raw) },
  { key: "preferredContact", header: "Предпочтительный способ связи", width: 30, value: (_c, x) => extractPreferredContact(x.raw) },
  // Telegram привязка через нашу платформу
  { key: "telegramLinked",   header: "Telegram привязан",             width: 18, value: (c) => c.telegramChatId ? "да" : "нет" },
  // Персональная ссылка на тест
  { key: "testLink",         header: "Ссылка на тест",                width: 44, value: (_c, x) => x.testLink },
  // Готовое персональное сообщение (имя + шаблон вакансии + ссылка) — копировать и отправить вручную
  { key: "personalMessage",  header: "Персональное сообщение",        width: 70, value: (_c, x) => x.personalMessage },
]
const ALL_FIELD_KEYS = COLUMN_DEFS.map(d => d.key)
// Клиентский каталог полей — в lib/candidates-export-fields.ts (route-файлам
// нельзя экспортировать произвольные значения, только обработчики).

async function buildXlsx(
  companyId: string,
  vacancyId: string,
  vacTitle: string | null,
  where: SQL | undefined,
  fields: string[],
): Promise<{ response: Response; count: number }> {
  const rows = await db.select().from(candidates).where(where).orderBy(desc(candidates.createdAt))
  const learned = await getLearnedNamesSet()

  // Шаблон приглашения на тест (для колонки «Персональное сообщение»): берём
  // testInviteMessage из боевого теста вакансии, иначе — дефолт.
  const [testDemoRow] = await db
    .select({ postDemoSettings: demos.postDemoSettings })
    .from(demos)
    .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "test")))
    .orderBy(desc(demos.updatedAt))
    .limit(1)
  const inviteTpl =
    (testDemoRow?.postDemoSettings as { testInviteMessage?: string } | null)?.testInviteMessage?.trim()
    || DEFAULT_TEST_INVITE_TEXT

  // Структура демо для расчёта прогресса по страницам (total = lessons + 2).
  let demoTotalPages = 0
  const blockToLesson = new Map<string, number>()
  const [demoRow] = await db
    .select({ lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo")))
    .orderBy(desc(demos.updatedAt))
    .limit(1)
  if (demoRow) {
    const lessons = Array.isArray(demoRow.lessonsJson) ? (demoRow.lessonsJson as LessonShape[]) : []
    demoTotalPages = lessons.length + 1
    lessons.forEach((lesson, idx) => {
      for (const b of (Array.isArray(lesson?.blocks) ? lesson.blocks : [])) {
        if (typeof b?.id === "string") blockToLesson.set(b.id, idx)
      }
    })
  }

  const candidateIds = rows.map(r => r.id)
  const hhByCandidate = new Map<string, { resumeUrl: string | null; name: string | null; raw: HhRawData | null }>()
  if (candidateIds.length > 0) {
    const hhRows = await db
      .select({
        candidateId: hhResponses.localCandidateId,
        resumeUrl: hhResponses.resumeUrl,
        name: hhResponses.candidateName,
        rawData: hhResponses.rawData,
      })
      .from(hhResponses)
      .where(and(eq(hhResponses.companyId, companyId), inArray(hhResponses.localCandidateId, candidateIds)))
    for (const h of hhRows) {
      if (h.candidateId && !hhByCandidate.has(h.candidateId)) {
        hhByCandidate.set(h.candidateId, {
          resumeUrl: h.resumeUrl ?? null,
          name: h.name ?? null,
          raw: (h.rawData as HhRawData | null) ?? null,
        })
      }
    }
  }

  // Дозаполнение token=NULL (кандидаты созданные в обход штатного флоу).
  // nanoid(32) — тот же способ, что lib/hh/client.ts при импорте hh-откликов.
  const rowsWithNullToken = rows.filter(r => !r.token)
  if (rowsWithNullToken.length > 0) {
    for (const r of rowsWithNullToken) {
      const newToken = nanoid(32)
      await db
        .update(candidates)
        .set({ token: newToken })
        .where(eq(candidates.id, r.id))
      r.token = newToken
    }
  }

  const progressOf = (demoProgressJson: unknown): string => {
    const progress = demoProgressJson as { blocks?: DemoBlock[] } | null
    const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
    const completedLessons = new Set<number>()
    let hasAnketa = false, hasThanks = false
    for (const b of blocks) {
      if (b.status !== "completed" || !b.blockId) continue
      if (b.blockId === "__anketa__") { hasAnketa = true; continue }
      if (b.blockId === "__thanks__") { hasThanks = true; continue }
      if (b.blockId === "__complete__") continue
      const idx = blockToLesson.get(b.blockId)
      if (typeof idx === "number") completedLessons.add(idx)
    }
    const completed = completedLessons.size + (hasAnketa ? 1 : 0) + (hasThanks ? 1 : 0)
    if (demoTotalPages <= 0) return completed > 0 ? String(completed) : "0"
    return `${Math.min(100, Math.round((completed / demoTotalPages) * 100))}%`
  }

  // Выбранные колонки в каноническом порядке каталога.
  const chosen = COLUMN_DEFS.filter(d => fields.includes(d.key))
  const cols = chosen.length > 0 ? chosen : COLUMN_DEFS

  const data = rows.map((c) => {
    const hh = hhByCandidate.get(c.id)
    const birth = extractBirthDate(c.birthDate as string | Date | null, c.anketaAnswers)
    // Ссылка на тест: /test/{shortId} если есть, иначе /test/{token}.
    // token к этому моменту гарантированно заполнен (дозаполнили выше).
    const testSlug = c.shortId ?? c.token
    const testLink = testSlug ? `https://company24.pro/test/${testSlug}` : ""
    // Готовое сообщение: ИМЯ кандидата (не фамилия) + шаблон + ссылка.
    // hh хранит имя/фамилию раздельно, НО кандидат мог вписать их наоборот
    // (first_name=«Макаренко»). Имя определяет единый резолвер по словарю.
    const rawName = hh?.raw as ({ resume?: { first_name?: string; last_name?: string }; first_name?: string }) | null | undefined
    const hhFirst = (rawName?.resume?.first_name ?? rawName?.first_name ?? "").trim()
    const hhLast  = (rawName?.resume?.last_name ?? "").trim()
    const fullNm  = deriveCandidateName(c.name, c.anketaAnswers, hh?.name ?? null) || ""
    const firstName = pickGivenName({ hhFirst, hhLast, fullName: fullNm, learned })
    const personalMessage = inviteTpl
      .replaceAll("{{name}}", firstName)
      .replaceAll("{{vacancy}}", vacTitle || "")
      .replaceAll("{{test_link}}", testLink)
      .replaceAll("{{company}}", "")
    const ctx: RowCtx = {
      hhName: hh?.name ?? null,
      hhResumeUrl: hh?.resumeUrl ?? null,
      birth,
      age: ageFromBirthDate(birth),
      progress: progressOf(c.demoProgressJson),
      raw: hh?.raw ?? null,
      testLink,
      personalMessage,
    }
    const rec: Record<string, string | number> = {}
    for (const col of cols) rec[col.header] = col.value(c, ctx)
    return rec
  })

  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map(c => c.header) })
  ws["!cols"] = cols.map(c => ({ wch: c.width }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Кандидаты")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

  const safeTitle = (vacTitle || "vacancy").replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "vacancy"
  const fileName = `Кандидаты — ${safeTitle}.xlsx`
  const response = new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="candidates.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  })
  return { response, count: rows.length }
}

const notPreview = or(isNull(candidates.source), ne(candidates.source, "preview"))

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const [vac] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    const { response, count } = await buildXlsx(user.companyId, id, vac.title, and(eq(candidates.vacancyId, id), notPreview), ALL_FIELD_KEYS)
    await logAudit({
      tenantId: user.companyId, userId: user.id, userEmail: user.email,
      action: "candidate_export", entityType: "vacancy", entityId: id, count,
      meta: { scope: "all", via: "GET" }, ip: ipFromRequest(_req),
    })
    return response
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[export-candidates GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const [vac] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

    const body = (await req.json().catch(() => ({}))) as {
      scope?: "all" | "selected" | "status"
      candidateIds?: unknown
      statuses?: unknown
      fields?: unknown
    }
    const scope = body.scope === "selected" || body.scope === "status" ? body.scope : "all"
    const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds.filter((x): x is string => typeof x === "string") : []
    const statuses = Array.isArray(body.statuses) ? body.statuses.filter((x): x is string => typeof x === "string") : []
    const fields = Array.isArray(body.fields)
      ? body.fields.filter((x): x is string => typeof x === "string" && ALL_FIELD_KEYS.includes(x))
      : ALL_FIELD_KEYS

    let where: SQL | undefined = and(eq(candidates.vacancyId, id), notPreview)
    if (scope === "selected") {
      if (candidateIds.length === 0) return apiError("Не выбраны кандидаты", 400)
      where = and(eq(candidates.vacancyId, id), notPreview, inArray(candidates.id, candidateIds))
    } else if (scope === "status") {
      if (statuses.length === 0) return apiError("Не выбраны статусы", 400)
      where = and(eq(candidates.vacancyId, id), notPreview, inArray(candidates.stage, statuses))
    }

    const { response, count } = await buildXlsx(user.companyId, id, vac.title, where, fields)
    await logAudit({
      tenantId: user.companyId, userId: user.id, userEmail: user.email,
      action: "candidate_export", entityType: "vacancy", entityId: id, count,
      meta: { scope, via: "POST", fields }, ip: ipFromRequest(req),
    })
    return response
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[export-candidates POST]", err)
    return apiError("Internal server error", 500)
  }
}
