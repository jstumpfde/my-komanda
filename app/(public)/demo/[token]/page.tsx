import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { isShortId } from "@/lib/short-id"
import DemoClient from "./demo-client"

const COOKIE_NAME = "myk_candidate_uuid"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DemoPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams

  // ?as=hr — preview-режим. Никаких новых кандидатов, никаких cookie-изменений.
  if (typeof sp.as === "string" && sp.as === "hr") {
    return <DemoClient />
  }

  // Реферальная логика только для short_id формата (2604V0010042). Старые токены
  // (preview/uuid/nanoid) — без изменений.
  if (!isShortId(token)) {
    return <DemoClient />
  }

  // 1. Owner ссылки — нужен, чтобы знать вакансию (на случай создания нового).
  const [owner] = await db
    .select({ id: candidates.id, shortId: candidates.shortId })
    .from(candidates)
    .where(eq(candidates.shortId, token))
    .limit(1)
  if (!owner) {
    // Неизвестный short_id — пусть клиент покажет "not found".
    return <DemoClient />
  }

  // 2. Кто пришёл — cookie или ?c=. Если совпадает с владельцем или с другим
  //    кандидатом этой ссылки — пропускаем без перенаправления.
  const cookieStore = await cookies()
  const cookieUuid = cookieStore.get(COOKIE_NAME)?.value
  const queryUuidRaw = typeof sp.c === "string" ? sp.c : undefined
  const queryUuid = queryUuidRaw && UUID_RE.test(queryUuidRaw) ? queryUuidRaw : undefined
  const visitorUuid = queryUuid || (cookieUuid && UUID_RE.test(cookieUuid) ? cookieUuid : undefined)

  if (visitorUuid) {
    if (visitorUuid === owner.id) return <DemoClient />
    const [existing] = await db
      .select({ id: candidates.id, shortId: candidates.shortId })
      .from(candidates)
      .where(eq(candidates.id, visitorUuid))
      .limit(1)
    if (existing && existing.shortId) {
      if (existing.shortId === token) return <DemoClient />
      // У посетителя свой short_id — перекидываем туда (без создания нового кандидата).
      redirect(`/demo/${existing.shortId}?c=${existing.id}`)
    }
    // Cookie/c указывают на несуществующего кандидата — fallthrough к visit.
  }

  // 3. Новый посетитель — делегируем в route handler (он создаст candidate и
  //    выставит cookie перед редиректом). Server Components не могут писать
  //    cookies, поэтому без bounce-route не обойтись.
  const visitParams = new URLSearchParams()
  if (typeof sp.utm_source === "string") visitParams.set("utm_source", sp.utm_source)
  if (typeof sp.utm_medium === "string") visitParams.set("utm_medium", sp.utm_medium)
  if (typeof sp.utm_campaign === "string") visitParams.set("utm_campaign", sp.utm_campaign)
  const qs = visitParams.toString()
  redirect(`/api/public/demo/${token}/visit${qs ? `?${qs}` : ""}`)
}
