import { NextRequest } from "next/server"
import { eq, and, count, isNull, isNotNull, inArray, notInArray, or, desc, type SQL } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { companies, companyFunnelTemplates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { CLOSED_VACANCY_STATUSES } from "@/lib/vacancies/lifecycle"
import { logActivity } from "@/lib/activity-log"
import { generateVacancyShortCode } from "@/lib/short-id"
import {
  applyFunnelTemplate,
  DEFAULT_TEMPLATE_KEY,
  FUNNEL_TEMPLATES,
  normalizeFunnelConfig,
} from "@/lib/funnel-builder/blocks"
import { buildDefaultAnketaQuestions } from "@/lib/funnel-builder/anketa-defaults"

// Transliterate Russian text to Latin for slug generation
function transliterate(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  return text
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? (c.match(/[a-z0-9]/) ? c : "-"))
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"))
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20")))
    const offset = (page - 1) * limit

    // scope (табы списка): active = всё кроме архива; archive = только архив;
    // trash = корзина (deleted_at IS NOT NULL). Legacy ?deleted=true == trash.
    // null/all/любое другое — без фильтра по статусу (обратная совместимость).
    const scope = req.nextUrl.searchParams.get("scope")
    const showDeleted = req.nextUrl.searchParams.get("deleted") === "true" || scope === "trash"
    const closed = CLOSED_VACANCY_STATUSES as readonly string[] as string[]
    // status может быть NULL (= draft) → для active-скоупа NULL включаем.
    const scopeWhere: SQL | undefined =
      scope === "archive" ? inArray(vacancies.status, closed)
      : scope === "active" ? (or(isNull(vacancies.status), notInArray(vacancies.status, closed)) as SQL)
      : undefined

    const baseWhere = showDeleted
      ? and(eq(vacancies.companyId, user.companyId), isNotNull(vacancies.deletedAt))
      : and(eq(vacancies.companyId, user.companyId), isNull(vacancies.deletedAt), scopeWhere)

    const [totalResult] = await db
      .select({ value: count() })
      .from(vacancies)
      .where(baseWhere)

    const rows = await db
      .select()
      .from(vacancies)
      .where(baseWhere)
      // Корзина — свежеудалённые сверху; остальные табы — по дате создания.
      .orderBy(showDeleted ? desc(vacancies.deletedAt) : vacancies.createdAt)
      .limit(limit)
      .offset(offset)

    // Счётчики табов «по БД». Активные/архив — среди НЕ удалённых;
    // корзина — удалённые.
    const notDeleted = and(eq(vacancies.companyId, user.companyId), isNull(vacancies.deletedAt))
    const [activeCnt] = await db
      .select({ value: count() })
      .from(vacancies)
      .where(and(notDeleted, or(isNull(vacancies.status), notInArray(vacancies.status, closed))))
    const [archivedCnt] = await db
      .select({ value: count() })
      .from(vacancies)
      .where(and(notDeleted, inArray(vacancies.status, closed)))
    const [trashedCnt] = await db
      .select({ value: count() })
      .from(vacancies)
      .where(and(eq(vacancies.companyId, user.companyId), isNotNull(vacancies.deletedAt)))

    // Срок хранения корзины компании — чтобы список посчитал обратный отсчёт.
    const [companyRow] = await db
      .select({ retention: companies.trashRetentionDays })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    return apiSuccess({
      vacancies: rows,
      total: totalResult?.value ?? 0,
      page,
      limit,
      trashRetentionDays: companyRow?.retention ?? 30,
      counts: {
        active:   activeCnt?.value ?? 0,
        archived: archivedCnt?.value ?? 0,
        trashed:  trashedCnt?.value ?? 0,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()

    const body = await req.json() as {
      title: string
      description?: string
      description_json?: Record<string, unknown>
      city?: string
      format?: string
      employment?: string
      category?: string
      salary_min?: number
      salary_max?: number
    }

    if (!body.title?.trim()) {
      return apiError("'title' is required", 400)
    }

    const slug = `${transliterate(body.title)}-${nanoid(6)}`

    console.log("[POST /api/modules/hr/vacancies] creating:", {
      companyId: user.companyId, userId: user.id, title: body.title.trim(), slug,
    })

    // ТЗ-1 Часть 5 (P0-17): новые вакансии стартуют со всеми AI-фичами OFF.
    // Schema defaults уже OFF (aiScoringEnabled, autoProcessingEnabled — false).
    // aiProcessSettings задаём явно — там enabled=false и midRangeAction=direct_demo (P0-7).
    const insertValues: Record<string, unknown> = {
      companyId: user.companyId,
      title: body.title.trim(),
      status: "draft",
      slug,
      aiScoringEnabled: false,
      autoProcessingEnabled: false,
      aiProcessSettings: {
        enabled: false,
        midRangeAction: "direct_demo",
      },
    }

    // Group 15: если у компании есть default-шаблон воронки — копируем его
    // config_json в новую вакансию и включаем конструктор. Не падаем если
    // что-то не так с шаблоном — просто оставляем дефолтный пустой конфиг.
    try {
      const [defaultTpl] = await db.select({
        configJson: companyFunnelTemplates.configJson,
      })
        .from(companyFunnelTemplates)
        .where(and(
          eq(companyFunnelTemplates.companyId, user.companyId),
          eq(companyFunnelTemplates.isDefault, true),
        ))
        .limit(1)
      if (defaultTpl) {
        insertValues.funnelConfigJson = normalizeFunnelConfig(defaultTpl.configJson)
        insertValues.funnelBuilderEnabled = true
      } else {
        // Группа 26: если у компании нет своего default-шаблона — применяем
        // built-in "Минимальная воронка" (короткая, 8 блоков). Юрий: длинная
        // воронка отсеивает сильных кандидатов, поэтому стартуем коротко.
        const builtIn = FUNNEL_TEMPLATES[DEFAULT_TEMPLATE_KEY]
        if (builtIn) {
          insertValues.funnelConfigJson = { blocks: applyFunnelTemplate(builtIn) }
          insertValues.funnelBuilderEnabled = true
        }
      }
    } catch (err) {
      console.warn("[POST /api/modules/hr/vacancies] default funnel template lookup failed:", err)
    }

    // drizzle/0156: применяем дефолты найма компании (companies.hiringDefaultsJson)
    // к новой вакансии. Консервативно — только однозначные маппинги. Если дефолтов
    // нет/пусто ({}) — поведение создания вакансии остаётся прежним. Любая ошибка
    // не должна ронять создание вакансии (try/catch, продолжаем без дефолтов).
    try {
      const [companyDefaults] = await db.select({
        hiringDefaultsJson: companies.hiringDefaultsJson,
      })
        .from(companies)
        .where(eq(companies.id, user.companyId))
        .limit(1)

      const hd = companyDefaults?.hiringDefaultsJson
      if (hd && typeof hd === "object") {
        // 2) Расписание — переносим значения времени/таймзоны/дней. НЕ трогаем
        //    scheduleEnabled (оставляем дефолт вакансии = true), только значения.
        const sched = hd.schedule
        if (sched) {
          if (sched.timezone) insertValues.scheduleTimezone = sched.timezone
          if (sched.interviewFrom) insertValues.scheduleStart = sched.interviewFrom
          if (sched.interviewTo) insertValues.scheduleEnd = sched.interviewTo
          // Дни недели: hd хранит строки "mon".."sun", вакансия — number[] 1=Пн..7=Вс.
          if (Array.isArray(sched.interviewDays) && sched.interviewDays.length > 0) {
            const dayMap: Record<string, number> = {
              mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
            }
            const mapped = sched.interviewDays
              .map((d) => dayMap[String(d).toLowerCase().slice(0, 3)])
              .filter((n): n is number => typeof n === "number")
            // Переносим только если ВСЕ дни распознаны (иначе маппинг неоднозначен — пропускаем).
            if (mapped.length === sched.interviewDays.length) {
              insertValues.scheduleWorkingDays = Array.from(new Set(mapped)).sort((a, b) => a - b)
            }
          }
        }

        // 3) hd.automation (autoDemo/autoInvite/minScore/autoReject) — ОТЛОЖЕНО.
        //    В схеме vacancies нет прямых одноимённых полей: aiProcessSettings —
        //    untyped jsonb без устоявшегося контракта этих ключей, а
        //    autoProcessingEnabled — это совсем другое (авто-разбор hh-откликов
        //    cron'ом, не autoDemo/autoInvite). Чтобы не выдумывать соответствие
        //    и не менять поведение скоринга/автоматизации — не маппим.
      }
    } catch (err) {
      console.warn("[POST /api/modules/hr/vacancies] hiring defaults apply failed:", err)
    }

    // createdBy might be null for some auth flows — make it optional
    if (user.id) insertValues.createdBy = user.id
    if (body.description?.trim()) insertValues.description = body.description.trim()
    if (body.city) insertValues.city = body.city
    if (body.format) insertValues.format = body.format
    if (body.employment) insertValues.employment = body.employment
    if (body.category) insertValues.category = body.category
    if (body.salary_min) insertValues.salaryMin = body.salary_min
    if (body.salary_max) insertValues.salaryMax = body.salary_max
    // Группа 26: дефолтные 5 вопросов короткой анкеты. Юрий — длинная анкета
    // отсеивает сильных кандидатов. Сидим только если клиент сам не передал
    // anketaQuestions в description_json (т.е. не работает с собственным набором).
    const incomingDescriptionJson = body.description_json
    const hasIncomingAnketa = !!(
      incomingDescriptionJson &&
      Array.isArray((incomingDescriptionJson as Record<string, unknown>).anketaQuestions)
    )
    const seededDescriptionJson: Record<string, unknown> = {
      ...(incomingDescriptionJson ?? {}),
    }
    if (!hasIncomingAnketa) {
      seededDescriptionJson.anketaQuestions = buildDefaultAnketaQuestions()
    }
    insertValues.descriptionJson = seededDescriptionJson

    const vacancy = await db.transaction(async (tx) => {
      const shortCode = await generateVacancyShortCode(tx, new Date())
      insertValues.shortCode = shortCode
      const [v] = await tx
        .insert(vacancies)
        .values(insertValues as typeof vacancies.$inferInsert)
        .returning()
      return v
    })

    console.log("[POST /api/modules/hr/vacancies] created:", vacancy.id, "short:", vacancy.shortCode)

    logActivity({ companyId: user.companyId, userId: user.id!, action: "create", entityType: "vacancy", entityId: vacancy.id, entityTitle: vacancy.title, module: "hr", request: req })
    return apiSuccess(vacancy, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /api/modules/hr/vacancies] ERROR:", err)
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
