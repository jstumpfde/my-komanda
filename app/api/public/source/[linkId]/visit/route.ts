import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancyUtmLinks } from "@/lib/db/schema"
import { generateCandidateShortId } from "@/lib/short-id"
import { generateCandidateToken } from "@/lib/candidate-tokens"
import { markDemoOpened } from "@/lib/candidates/mark-demo-opened"

// Источник-демо bounce. Зеркало app/api/public/demo/[token]/visit/route.ts —
// но «owner» берётся не из candidates.short_id, а из vacancy_utm_links.id.
// Используется, когда HR создал источник с destinationType='demo': /v/{slug}
// (app/v/[code]/route.ts) редиректит сюда, мы создаём кандидата под вакансию
// ссылки, выставляем cookie myk_candidate_uuid и отправляем посетителя сразу
// на /demo/{newShortId}?c={uuid}.

const COOKIE_NAME = "myk_candidate_uuid"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 дней, как у /demo/.../visit
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params

  // Невалидный uuid → отправляем домой (как /v/[code] делает для unknown slug).
  if (!UUID_RE.test(linkId)) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  const [link] = await db
    .select({
      id:        vacancyUtmLinks.id,
      vacancyId: vacancyUtmLinks.vacancyId,
      source:    vacancyUtmLinks.source,
    })
    .from(vacancyUtmLinks)
    .where(eq(vacancyUtmLinks.id, linkId))
    .limit(1)

  if (!link) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Существующий посетитель — отправляем на его собственный демо-shortId,
  // дубль не плодим. Tenant guard: дедуп срабатывает ТОЛЬКО если cookie
  // указывает на кандидата ТОЙ ЖЕ вакансии что у ссылки. Иначе — клик
  // по ссылке компании B при наличии cookie кандидата компании A раньше
  // отправлял на демо A (UX-баг кросс-тенант, инцидент #16, slug о265ea
  // 28.05). Cookie от другой вакансии теперь игнорируется → fallthrough
  // к созданию нового кандидата под link.vacancyId, новый cookie заместит
  // старый. Аналогичная защита в /api/public/demo/[token]/visit.
  const cookieUuid = req.cookies.get(COOKIE_NAME)?.value
  if (cookieUuid && UUID_RE.test(cookieUuid)) {
    const [existing] = await db
      .select({
        id:        candidates.id,
        shortId:   candidates.shortId,
        vacancyId: candidates.vacancyId,
      })
      .from(candidates)
      .where(eq(candidates.id, cookieUuid))
      .limit(1)
    if (existing && existing.shortId && existing.vacancyId === link.vacancyId) {
      await markDemoOpened(existing.id)
      return NextResponse.redirect(
        new URL(`/demo/${existing.shortId}?c=${existing.id}`, req.url),
      )
    }
    // Cookie указывает на (а) несуществующего кандидата, (б) кандидата
    // другой вакансии — fallthrough, создаём нового под link.vacancyId.
  }

  // Новый посетитель — создаём кандидата под вакансию ссылки.
  // referredByShortId="src:{linkId}" — техническая метка для аудита, чтобы
  // отличать source-демо от реферал-демо (в /demo/.../visit там short_id
  // владельца ссылки). На воронку не влияет — поле текстовое, нигде не
  // парсится как short_id (он матчится по isShortId, а "src:..." туда не
  // попадает).
  const created = await db.transaction(async (tx) => {
    const ids = await generateCandidateShortId(tx, link.vacancyId)
    if (!ids) return null
    const [row] = await tx
      .insert(candidates)
      .values({
        vacancyId:         link.vacancyId,
        name:              "Новый кандидат",
        source:            link.source,
        stage:             "new",
        token:             generateCandidateToken(),
        shortId:           ids.shortId,
        sequenceNumber:    ids.sequenceNumber,
        referredByShortId: `src:${link.id}`,
      })
      .returning({ id: candidates.id, shortId: candidates.shortId })
    return row ?? null
  })

  if (!created || !created.shortId) {
    // Не смогли (нет short_code у вакансии и т.п.) — отправляем на описание
    // вакансии как безопасный фолбэк.
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Инкремент счётчика кандидатов на ссылке — единообразно с apply-веткой
  // (/api/public/vacancy/[slug]/apply:65-67). Делаем после успешного INSERT.
  await db
    .update(vacancyUtmLinks)
    .set({ candidatesCount: sql`${vacancyUtmLinks.candidatesCount} + 1` })
    .where(eq(vacancyUtmLinks.id, link.id))

  const target = new URL(`/demo/${created.shortId}?c=${created.id}`, req.url)
  const res = NextResponse.redirect(target)
  res.cookies.set({
    name:     COOKIE_NAME,
    value:    created.id,
    maxAge:   COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    path:     "/",
  })
  return res
}
