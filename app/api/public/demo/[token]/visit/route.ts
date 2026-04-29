import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { isShortId, generateCandidateShortId } from "@/lib/short-id"
import { generateCandidateToken } from "@/lib/candidate-tokens"

const COOKIE_NAME = "myk_candidate_uuid"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 дней
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function detectSourceFromUtm(utmSource: string | undefined | null): string {
  if (!utmSource) return "referral"
  const s = utmSource.toLowerCase()
  if (s === "hh" || s === "hh.ru" || s === "headhunter") return "hh-referral"
  if (s === "telegram" || s === "tg") return "telegram-referral"
  if (s === "vk" || s === "vkontakte") return "vk-referral"
  return `${s}-referral`
}

// GET /api/public/demo/<shortId>/visit
// Bounce-route: создаёт нового кандидата под вакансию владельца ссылки,
// выставляет cookie и редиректит на персональный /demo/<newShortId>?c=<uuid>.
// Если cookie уже указывает на валидного кандидата — просто редиректит на его
// собственный short_id.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!isShortId(token)) {
    return NextResponse.redirect(new URL(`/demo/${token}`, req.url))
  }

  // Owner — нужна вакансия для нового кандидата.
  const [owner] = await db
    .select({ id: candidates.id, vacancyId: candidates.vacancyId, shortId: candidates.shortId })
    .from(candidates)
    .where(eq(candidates.shortId, token))
    .limit(1)
  if (!owner) {
    return NextResponse.redirect(new URL(`/demo/${token}`, req.url))
  }

  // Если у посетителя уже есть cookie с валидным кандидатом — отправим к нему,
  // а не плодим дубль (это покрывает гонку, когда page.tsx и /visit обоюдно
  // отрабатывают).
  const cookieUuid = req.cookies.get(COOKIE_NAME)?.value
  if (cookieUuid && UUID_RE.test(cookieUuid)) {
    if (cookieUuid === owner.id) {
      return NextResponse.redirect(new URL(`/demo/${token}?c=${owner.id}`, req.url))
    }
    const [existing] = await db
      .select({ id: candidates.id, shortId: candidates.shortId })
      .from(candidates)
      .where(eq(candidates.id, cookieUuid))
      .limit(1)
    if (existing && existing.shortId) {
      return NextResponse.redirect(new URL(`/demo/${existing.shortId}?c=${existing.id}`, req.url))
    }
  }

  // Если owner существует и cookie ещё не установлено — признать
  // первого посетителя как самого owner-а. Так избегаем создания
  // дублей "Новый кандидат" когда сам кандидат впервые кликает на
  // свою же ссылку.
  if (owner?.id && !cookieUuid) {
    const ownerRedirect = new URL(
      `/demo/${owner.shortId ?? token}?c=${owner.id}`,
      req.url
    )
    const res = NextResponse.redirect(ownerRedirect)
    res.cookies.set({
      name: COOKIE_NAME,
      value: owner.id,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })
    return res
  }

  // Создаём нового кандидата.
  const utmSource = req.nextUrl.searchParams.get("utm_source")
  const source = detectSourceFromUtm(utmSource)

  const created = await db.transaction(async (tx) => {
    const ids = await generateCandidateShortId(tx, owner.vacancyId)
    if (!ids) return null
    const [row] = await tx
      .insert(candidates)
      .values({
        vacancyId: owner.vacancyId,
        name: "Новый кандидат",
        source,
        stage: "new",
        token: generateCandidateToken(),
        shortId: ids.shortId,
        sequenceNumber: ids.sequenceNumber,
        referredByShortId: owner.shortId ?? token,
      })
      .returning({ id: candidates.id, shortId: candidates.shortId })
    return row ?? null
  })

  if (!created || !created.shortId) {
    // Не смогли (нет short_code у вакансии и т.п.) — отправляем как есть.
    return NextResponse.redirect(new URL(`/demo/${token}`, req.url))
  }

  const targetUrl = new URL(`/demo/${created.shortId}?c=${created.id}`, req.url)
  const res = NextResponse.redirect(targetUrl)
  res.cookies.set({
    name: COOKIE_NAME,
    value: created.id,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
  return res
}
