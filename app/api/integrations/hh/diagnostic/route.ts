// Диагностика hh.ru интеграции (Группа 17 mini).
//
// Контекст: иногда hh OAuth привязан к неправильному hh-аккаунту
// (нужен аккаунт-работодатель с доступом к конкретной вакансии).
// Этот endpoint позволяет HR увидеть к какому hh-аккаунту привязана
// компания и проверить доступ к каждой связанной вакансии.
//
// Никаких изменений в БД здесь не делаем — только диагностика.

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations, hhVacancies, vacancies } from "@/lib/db/schema"
import { eq, and, isNotNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { getMe, getVacancy } from "@/lib/hh-api"

export const dynamic = "force-dynamic"

interface DiagnosticVacancy {
  hhVacancyId:   string
  vacancyTitle:  string
  localVacancyId: string | null
  hasAccess:     boolean
  errorReason?:  string
}

interface DiagnosticResponse {
  tokenStatus:      "valid" | "expired" | "missing"
  hhAccountInfo?:   {
    employerId:    string
    employerName:  string | null
    managerId:     string | null
    isActive:      boolean
    connectedAt:   string | null
    lastSyncedAt:  string | null
    tokenExpiresAt: string | null
  }
  vacancies:        DiagnosticVacancy[]
  reconnectUrl:     string
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const companyId = session.user.companyId

  // 1. Базовый ряд интеграции (даже если is_active=false — покажем «expired»).
  const [integration] = await db
    .select()
    .from(hhIntegrations)
    .where(eq(hhIntegrations.companyId, companyId))
    .limit(1)

  if (!integration) {
    const payload: DiagnosticResponse = {
      tokenStatus:  "missing",
      vacancies:    [],
      reconnectUrl: "/api/integrations/hh/connect",
    }
    return NextResponse.json(payload)
  }

  // 2. Пытаемся получить валидный токен (auto-refresh внутри). null = refresh
  // упал → токен «expired». isActive=false тоже трактуется как expired.
  const tokenResult = integration.isActive ? await getValidToken(companyId) : null
  const tokenStatus: DiagnosticResponse["tokenStatus"] =
    tokenResult ? "valid" : (integration.isActive ? "expired" : "expired")

  // 3. Список вакансий, у которых есть привязка к hh.
  const hhVacRows = await db
    .select({
      hhVacancyId:    hhVacancies.hhVacancyId,
      hhTitle:        hhVacancies.title,
      localVacancyId: hhVacancies.localVacancyId,
      localTitle:     vacancies.title,
    })
    .from(hhVacancies)
    .leftJoin(vacancies, eq(vacancies.id, hhVacancies.localVacancyId))
    .where(eq(hhVacancies.companyId, companyId))

  // Также вакансии, которые привязаны через vacancies.hhVacancyId (legacy).
  const localLinkedRows = await db
    .select({
      hhVacancyId: vacancies.hhVacancyId,
      title:       vacancies.title,
      id:          vacancies.id,
    })
    .from(vacancies)
    .where(and(eq(vacancies.companyId, companyId), isNotNull(vacancies.hhVacancyId)))

  // Сливаем: уникальные hhVacancyId.
  const merged = new Map<string, DiagnosticVacancy>()
  for (const row of hhVacRows) {
    merged.set(row.hhVacancyId, {
      hhVacancyId:    row.hhVacancyId,
      vacancyTitle:   row.localTitle ?? row.hhTitle,
      localVacancyId: row.localVacancyId,
      hasAccess:      false,
    })
  }
  for (const row of localLinkedRows) {
    if (!row.hhVacancyId) continue
    if (!merged.has(row.hhVacancyId)) {
      merged.set(row.hhVacancyId, {
        hhVacancyId:    row.hhVacancyId,
        vacancyTitle:   row.title,
        localVacancyId: row.id,
        hasAccess:      false,
      })
    }
  }

  // 4. Если токен валиден — спрашиваем hh /me + /vacancies/{id} по каждой.
  let employerName: string | null = integration.employerName
  let managerId: string | null = null

  if (tokenResult) {
    try {
      const me = await getMe(tokenResult.accessToken) as { id?: string; employer?: { id?: string; name?: string } }
      if (me.employer?.name) employerName = me.employer.name
      managerId = me.id ?? null
    } catch (err) {
      console.warn("[hh:diagnostic] /me failed:", err instanceof Error ? err.message : err)
    }

    // По каждой вакансии — пробуем getVacancy, неуспех = нет доступа.
    // Лимитируем 20 параллельных запросов, чтобы не упереться в rate-limit.
    const entries = Array.from(merged.values())
    await Promise.all(entries.slice(0, 20).map(async (entry) => {
      try {
        await getVacancy(tokenResult.accessToken, entry.hhVacancyId)
        entry.hasAccess = true
      } catch (err) {
        entry.errorReason = err instanceof Error
          ? err.message.replace(/^HH API[^:]*: /, "")
          : String(err)
      }
    }))
  }

  const payload: DiagnosticResponse = {
    tokenStatus,
    hhAccountInfo: {
      employerId:     integration.employerId,
      employerName,
      managerId,
      isActive:       integration.isActive,
      connectedAt:    integration.createdAt ? integration.createdAt.toISOString() : null,
      lastSyncedAt:   integration.lastSyncedAt ? integration.lastSyncedAt.toISOString() : null,
      tokenExpiresAt: integration.tokenExpiresAt ? integration.tokenExpiresAt.toISOString() : null,
    },
    vacancies:    Array.from(merged.values()),
    reconnectUrl: "/api/integrations/hh/connect",
  }

  return NextResponse.json(payload)
}
