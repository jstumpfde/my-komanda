// Group 14 — /admin/platform.
// Server component: загружает данные для всех табов и передаёт в клиент.
// Защита уже есть в layout.tsx (email whitelist).

import { asc, desc, eq, sql, count } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  vacancies,
  platformEmergencyActions,
  platformFunnelTemplates,
  yuliaConversations,
  yuliaMessages,
  users,
  cronRuns,
} from "@/lib/db/schema"
import { YULIA_SYSTEM_PROMPT } from "@/lib/ai/yulia/prompts"
import { listMigrationsWithStatus } from "@/lib/platform/settings-migrations"
import { PlatformAdminClient } from "./platform-admin-client"

export const dynamic = "force-dynamic"

export default async function PlatformAdminPage() {
  const migrations = await listMigrationsWithStatus()

  // Companies + per-company vacancies & AI counts.
  const companiesRows = await db
    .select({
      id:              companies.id,
      name:            companies.name,
      createdAt:       companies.createdAt,
      aiChatbotKilled: companies.aiChatbotKilled,
      vacanciesCount:  sql<number>`count(${vacancies.id})`.mapWith(Number),
      aiEnabledCount:  sql<number>`count(*) filter (where ${vacancies.aiChatbotEnabled} = true)`.mapWith(Number),
    })
    .from(companies)
    .leftJoin(vacancies, eq(vacancies.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(desc(companies.createdAt))

  // Active vacancies with AI chatbot.
  const aiVacanciesRows = await db
    .select({
      id:               vacancies.id,
      title:            vacancies.title,
      status:           vacancies.status,
      companyId:        vacancies.companyId,
      companyName:      companies.name,
      aiChatbotEnabled: vacancies.aiChatbotEnabled,
      promptLength:     sql<number>`coalesce(length(${vacancies.aiChatbotPrompt}), 0)`.mapWith(Number),
    })
    .from(vacancies)
    .innerJoin(companies, eq(companies.id, vacancies.companyId))
    .where(eq(vacancies.aiChatbotEnabled, true))
    .orderBy(desc(vacancies.createdAt))
    .limit(500)

  const recentActions = await db
    .select({
      id:         platformEmergencyActions.id,
      actionType: platformEmergencyActions.actionType,
      payload:    platformEmergencyActions.payload,
      result:     platformEmergencyActions.result,
      executedAt: platformEmergencyActions.executedAt,
      executedBy: platformEmergencyActions.executedBy,
    })
    .from(platformEmergencyActions)
    .orderBy(desc(platformEmergencyActions.executedAt))
    .limit(50)

  const [{ count: companiesTotal }] = await db
    .select({ count: count() })
    .from(companies)

  // Group 16: platform templates + список вакансий с включённым конструктором
  // (для майнинга — копирования funnel_config_json в шаблон).
  const templateRows = await db
    .select({
      id:               platformFunnelTemplates.id,
      name:             platformFunnelTemplates.name,
      description:      platformFunnelTemplates.description,
      industry:         platformFunnelTemplates.industry,
      sourceVacancyId:  platformFunnelTemplates.sourceVacancyId,
      sourceCompanyId:  platformFunnelTemplates.sourceCompanyId,
      isPublished:      platformFunnelTemplates.isPublished,
      createdAt:        platformFunnelTemplates.createdAt,
    })
    .from(platformFunnelTemplates)
    .orderBy(desc(platformFunnelTemplates.isPublished), asc(platformFunnelTemplates.name))

  const minableVacanciesRows = await db
    .select({
      id:           vacancies.id,
      title:        vacancies.title,
      companyId:    vacancies.companyId,
      companyName:  companies.name,
    })
    .from(vacancies)
    .innerJoin(companies, eq(companies.id, vacancies.companyId))
    .where(eq(vacancies.funnelBuilderEnabled, true))
    .orderBy(desc(vacancies.updatedAt))
    .limit(500)

  // Группа 28: метрики и история диалогов Юлии.
  const [yuliaTotals] = await db
    .select({
      total:     count(),
      active:    sql<number>`count(*) filter (where ${yuliaConversations.status} = 'active')`.mapWith(Number),
      completed: sql<number>`count(*) filter (where ${yuliaConversations.status} = 'completed')`.mapWith(Number),
      abandoned: sql<number>`count(*) filter (where ${yuliaConversations.status} = 'abandoned')`.mapWith(Number),
    })
    .from(yuliaConversations)

  // Среднее число сообщений в завершённых диалогах.
  const [avgRow] = await db
    .select({
      avg: sql<number>`coalesce(avg(c), 0)`.mapWith(Number),
    })
    .from(
      db.select({ c: count() })
        .from(yuliaMessages)
        .innerJoin(yuliaConversations, eq(yuliaConversations.id, yuliaMessages.conversationId))
        .where(eq(yuliaConversations.status, "completed"))
        .groupBy(yuliaConversations.id)
        .as("per_conv"),
    )

  const yuliaConvs = await db
    .select({
      id:                 yuliaConversations.id,
      contextType:        yuliaConversations.contextType,
      status:             yuliaConversations.status,
      resultingEntityId:  yuliaConversations.resultingEntityId,
      createdAt:          yuliaConversations.createdAt,
      updatedAt:          yuliaConversations.updatedAt,
      userId:             yuliaConversations.userId,
      userEmail:          users.email,
      userName:           users.name,
      companyId:          yuliaConversations.companyId,
      companyName:        companies.name,
      messageCount:       sql<number>`(select count(*) from yulia_messages where conversation_id = ${yuliaConversations.id})`.mapWith(Number),
    })
    .from(yuliaConversations)
    .leftJoin(users, eq(users.id, yuliaConversations.userId))
    .leftJoin(companies, eq(companies.id, yuliaConversations.companyId))
    .orderBy(desc(yuliaConversations.updatedAt))
    .limit(30)

  // Cron: последние запуски (мониторинг auto-invoices и др.).
  const cronRunsRows = await db
    .select({
      id:           cronRuns.id,
      cronName:     cronRuns.cronName,
      startedAt:    cronRuns.startedAt,
      finishedAt:   cronRuns.finishedAt,
      status:       cronRuns.status,
      durationMs:   cronRuns.durationMs,
      errorMessage: cronRuns.errorMessage,
      metadata:     cronRuns.metadata,
    })
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(50)

  return (
    <PlatformAdminClient
      cronRuns={cronRunsRows.map(r => ({
        ...r,
        startedAt:  r.startedAt ? r.startedAt.toISOString() : null,
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      }))}
      migrations={migrations.map(m => ({
        ...m,
        appliedAt: m.appliedAt ? m.appliedAt.toISOString() : null,
      }))}
      companies={companiesRows.map(c => ({
        ...c,
        createdAt: c.createdAt ? c.createdAt.toISOString() : null,
      }))}
      companiesTotal={companiesTotal}
      vacancies={aiVacanciesRows}
      recentActions={recentActions.map(a => ({
        ...a,
        executedAt: a.executedAt ? a.executedAt.toISOString() : null,
      }))}
      templates={templateRows.map(t => ({
        ...t,
        createdAt: t.createdAt ? t.createdAt.toISOString() : null,
      }))}
      minableVacancies={minableVacanciesRows}
      yulia={{
        metrics: {
          total:     yuliaTotals?.total     ?? 0,
          active:    yuliaTotals?.active    ?? 0,
          completed: yuliaTotals?.completed ?? 0,
          abandoned: yuliaTotals?.abandoned ?? 0,
          avgMessages: Math.round((avgRow?.avg ?? 0) * 10) / 10,
        },
        systemPrompt: YULIA_SYSTEM_PROMPT,
        conversations: yuliaConvs.map(c => ({
          id:                 c.id,
          contextType:        c.contextType,
          status:             c.status,
          resultingEntityId:  c.resultingEntityId,
          createdAt:          c.createdAt ? c.createdAt.toISOString() : null,
          updatedAt:          c.updatedAt ? c.updatedAt.toISOString() : null,
          userEmail:          c.userEmail,
          userName:           c.userName,
          companyName:        c.companyName,
          messageCount:       c.messageCount,
        })),
      }}
    />
  )
}
