import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { isShortId, generateCandidateShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { generateCandidateToken } from "@/lib/candidate-tokens"
import { markDemoOpened } from "@/lib/candidates/mark-demo-opened"
// База редиректа — из env (НЕ req.url): Next 16 подставляет внутренний origin
// (http://localhost:3000), кандидаты за nginx получали битый Location (02.07).
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

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
    return NextResponse.redirect(new URL(`/demo/${token}`, getAppBaseUrl()))
  }

  // Анти-перебор предсказуемых short_id: этот роут СОЗДАЁТ карточки кандидатов,
  // поэтому перебор мог бы засорять воронку тысячами «Новый кандидат». Режем по
  // IP (см. lib/public/rate-limit-public).
  if (!checkPublicTokenRateLimit(req, "demo-visit")) {
    return new NextResponse("Слишком много запросов, попробуйте позже", { status: 429 })
  }

  // Owner — нужна вакансия для нового кандидата.
  const [owner] = await db
    .select({ id: candidates.id, vacancyId: candidates.vacancyId, shortId: candidates.shortId })
    .from(candidates)
    .where(eq(candidates.shortId, token))
    .limit(1)
  if (!owner) {
    return NextResponse.redirect(new URL(`/demo/${token}`, getAppBaseUrl()))
  }

  // Если у посетителя уже есть cookie с валидным кандидатом — отправим к нему,
  // а не плодим дубль (это покрывает гонку, когда page.tsx и /visit обоюдно
  // отрабатывают).
  const cookieUuid = req.cookies.get(COOKIE_NAME)?.value
  if (cookieUuid && UUID_RE.test(cookieUuid)) {
    if (cookieUuid === owner.id) {
      // Owner кликнул на свою ссылку — фиксируем первый просмотр демо.
      await markDemoOpened(owner.id)
      return NextResponse.redirect(new URL(`/demo/${token}?c=${owner.id}`, getAppBaseUrl()))
    }
    const [existing] = await db
      .select({
        id:        candidates.id,
        shortId:   candidates.shortId,
        vacancyId: candidates.vacancyId,
      })
      .from(candidates)
      .where(eq(candidates.id, cookieUuid))
      .limit(1)
    // Tenant guard симметричен page.tsx #9 fix (app/(public)/demo/[token]/page.tsx:69):
    // редиректить на демо existing-кандидата можно только если он принадлежит
    // той же вакансии что и owner текущей ссылки. Раньше эта проверка стояла
    // только в page.tsx, и при fallthrough в /visit cookie от чужой вакансии
    // снова уводил на чужое демо — защита page.tsx эффективно отменялась.
    // Инцидент #16 (28.05) для зеркального source/visit, разбор показал, что
    // дефект существует и здесь — закрываем заодно.
    if (existing && existing.shortId && existing.vacancyId === owner.vacancyId) {
      // Существующий кандидат заходит на чужую ссылку владельца (но тех же
      // тенантов) — фиксируем его собственное открытие демо (не owner'а).
      await markDemoOpened(existing.id)
      return NextResponse.redirect(new URL(`/demo/${existing.shortId}?c=${existing.id}`, getAppBaseUrl()))
    }
    // Cookie указывает на (а) несуществующего кандидата, (б) кандидата
    // другой вакансии — fallthrough, создаём нового под owner.vacancyId.
  }

  // Если owner существует и cookie ещё не установлено — признать
  // первого посетителя как самого owner-а. Так избегаем создания
  // дублей "Новый кандидат" когда сам кандидат впервые кликает на
  // свою же ссылку.
  if (owner?.id && !cookieUuid) {
    await markDemoOpened(owner.id)
    const ownerRedirect = new URL(
      `/demo/${owner.shortId ?? token}?c=${owner.id}`,
      getAppBaseUrl()
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
    return NextResponse.redirect(new URL(`/demo/${token}`, getAppBaseUrl()))
  }

  const targetUrl = new URL(`/demo/${created.shortId}?c=${created.id}`, getAppBaseUrl())
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
