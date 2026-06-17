// GET/POST /api/modules/hr/vacancies/[id]/broadcast-templates
//
// Менеджер именованных шаблонов для «Рассылка через hh».
// Хранилище — postDemoSettings.broadcastTemplates у demo kind='test' этой
// вакансии (jsonb, без отдельной таблицы/миграции). Каждый шаблон:
// { id: string; name: string; text: string }. Текст хранится С ПЛЕЙСХОЛДЕРАМИ
// ({{name}}/{{vacancy}}/{{test_link}}) — конкретные значения подставляет UI.
//
// GET  → { templates: [...] }
// POST → body { action: 'create'|'update'|'delete', id?, name?, text? }
//        возвращает обновлённый { templates: [...] }
//
// Скоуп по компании вакансии (tenant-изоляция), auth как в соседних роутах.

import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, demos } from "@/lib/db/schema"
import type { PostDemoSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

type BroadcastTemplate = { id: string; name: string; text: string }

// Найти test-demo вакансии (скоуп по компании) + текущие шаблоны.
async function loadTestDemo(vacancyId: string, companyId: string) {
  // tenant-изоляция: вакансия должна принадлежать компании
  const [vac] = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
    .limit(1)
  if (!vac) return null

  const [demo] = await db
    .select({ id: demos.id, postDemoSettings: demos.postDemoSettings })
    .from(demos)
    .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "test")))
    .limit(1)
  if (!demo) return { demo: null as null, templates: [] as BroadcastTemplate[] }

  const settings = (demo.postDemoSettings ?? {}) as PostDemoSettings
  const templates = Array.isArray(settings.broadcastTemplates)
    ? (settings.broadcastTemplates as BroadcastTemplate[])
    : []
  return { demo: { id: demo.id }, templates }
}

// Записать массив шаблонов обратно в postDemoSettings (jsonb merge).
async function saveTemplates(vacancyId: string, templates: BroadcastTemplate[]) {
  await db
    .update(demos)
    .set({
      postDemoSettings: sql`COALESCE(${demos.postDemoSettings}, '{}'::jsonb) || jsonb_build_object('broadcastTemplates', ${JSON.stringify(templates)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "test")))
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const loaded = await loadTestDemo(id, user.companyId)
    if (!loaded) return apiError("Вакансия не найдена", 404)

    return apiSuccess({ templates: loaded.templates })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[broadcast-templates GET]", err instanceof Error ? err.message : err)
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

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown
      id?: unknown
      name?: unknown
      text?: unknown
    }
    const action = typeof body.action === "string" ? body.action : ""
    const tplId = typeof body.id === "string" ? body.id : ""
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const text = typeof body.text === "string" ? body.text : ""

    if (action !== "create" && action !== "update" && action !== "delete") {
      return apiError("Неизвестное действие", 400)
    }

    const loaded = await loadTestDemo(id, user.companyId)
    if (!loaded) return apiError("Вакансия не найдена", 404)
    if (!loaded.demo) {
      return apiError("Сначала настройте тест на вакансии (вкладка «Тест»)", 400)
    }

    let templates = loaded.templates

    if (action === "create") {
      if (!name) return apiError("Укажите название шаблона", 400)
      templates = [...templates, { id: randomUUID(), name, text }]
    } else if (action === "update") {
      if (!tplId) return apiError("Не указан шаблон для обновления", 400)
      if (!name) return apiError("Укажите название шаблона", 400)
      const idx = templates.findIndex((t) => t.id === tplId)
      if (idx === -1) return apiError("Шаблон не найден", 404)
      templates = templates.map((t) =>
        t.id === tplId ? { ...t, name, text } : t,
      )
    } else if (action === "delete") {
      if (!tplId) return apiError("Не указан шаблон для удаления", 400)
      templates = templates.filter((t) => t.id !== tplId)
    }

    await saveTemplates(id, templates)
    return apiSuccess({ templates })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[broadcast-templates POST]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
