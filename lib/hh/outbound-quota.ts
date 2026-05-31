// lib/hh/outbound-quota.ts
//
// Учёт дневного лимита просмотров резюме hh по компании (§3 ТЗ).
// Таблица hh_resume_view_quota (миграция 0159), PK (company_id, date).
//   viewsFromSearch — просмотры из поиска (лимит DAILY_SEARCH_VIEW_LIMIT/день)
//   totalViews      — суммарные уникальные просмотры (DAILY_TOTAL_VIEW_LIMIT/день)
//
// ПОИСК (GET /resumes) лимит НЕ расходует — учитываем только GET /resumes/{id}
// при приглашении.

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhResumeViewQuota } from "@/lib/db/schema"
import { DAILY_SEARCH_VIEW_LIMIT, DAILY_TOTAL_VIEW_LIMIT } from "@/lib/hh/outbound"

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

export interface QuotaState {
  date: string
  viewsFromSearch: number
  totalViews: number
  searchRemaining: number
  totalRemaining: number
  exhausted: boolean
}

function toState(date: string, viewsFromSearch: number, totalViews: number): QuotaState {
  const searchRemaining = Math.max(0, DAILY_SEARCH_VIEW_LIMIT - viewsFromSearch)
  const totalRemaining = Math.max(0, DAILY_TOTAL_VIEW_LIMIT - totalViews)
  return {
    date,
    viewsFromSearch,
    totalViews,
    searchRemaining,
    totalRemaining,
    exhausted: searchRemaining <= 0 || totalRemaining <= 0,
  }
}

export async function getQuota(companyId: string): Promise<QuotaState> {
  const date = todayUtc()
  const [row] = await db
    .select()
    .from(hhResumeViewQuota)
    .where(and(eq(hhResumeViewQuota.companyId, companyId), eq(hhResumeViewQuota.date, date)))
    .limit(1)
  return toState(date, row?.viewsFromSearch ?? 0, row?.totalViews ?? 0)
}

// Инкремент квоты на один просмотр резюме из поиска (GET /resumes/{id} при
// приглашении). Атомарно через UPSERT. Возвращает обновлённое состояние.
export async function incrementResumeViewQuota(companyId: string, by = 1): Promise<QuotaState> {
  const date = todayUtc()
  const [row] = await db
    .insert(hhResumeViewQuota)
    .values({ companyId, date, viewsFromSearch: by, totalViews: by })
    .onConflictDoUpdate({
      target: [hhResumeViewQuota.companyId, hhResumeViewQuota.date],
      set: {
        viewsFromSearch: sql`${hhResumeViewQuota.viewsFromSearch} + ${by}`,
        totalViews: sql`${hhResumeViewQuota.totalViews} + ${by}`,
      },
    })
    .returning()
  return toState(date, row?.viewsFromSearch ?? by, row?.totalViews ?? by)
}
