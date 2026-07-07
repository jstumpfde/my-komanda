// GET /api/modules/hr/settings-map?vacancyId=...
//
// «Карта настроек» — read-only снимок эффективных значений всего реестра
// SETTINGS_REGISTRY (lib/settings/registry.ts). Ничего не пишет в БД.
//
// Для каждой записи реестра резолвит эффективное значение по resolve.kind:
//   companyHiringDefaults — companies.hiring_defaults_json[path]
//   effectiveMessage      — getEffectiveMessageDefaults(companyId)[path],
//                           перебитый vacancy-полем (если передан vacancyId)
//   platformSetting       — platform_settings.value по ключу path
//   spec                  — getSpec(vacancyId)[path] (Zod-бэкфилл)
//   vacancy               — vacancies.<path> (в т.ч. followUpCampaign.* через
//                           join на follow_up_campaigns) — требует vacancyId
//   companyColumn         — прямая колонка companies.<path>
//   demoSettings          — demos.post_demo_settings по kind ("demo"/"test")
//   code                  — не хранится в БД (используется вместе с hardcoded)
//
// origin: "default" (работает дефолт кода/платформы) | "company" (company-level
// оверрайд) | "vacancy" (vacancy-level оверрайд) | "code" (hardcoded-запись).

import { NextRequest } from "next/server"
import { eq, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  vacancies,
  demos,
  followUpCampaigns,
  platformSettings,
  type CompanyHiringDefaults,
} from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getSpec } from "@/lib/core/spec/store"
import { getEffectiveMessageDefaults } from "@/lib/messaging/effective-message-defaults"
import { SETTINGS_REGISTRY, type SettingsRegistryEntry } from "@/lib/settings/registry"

const MAX_VALUE_LEN = 80

// ─── Утилиты ────────────────────────────────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  if (obj == null || !path) return undefined
  let cur: unknown = obj
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—"
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return "—"
    return trimmed.length > MAX_VALUE_LEN ? `${trimmed.slice(0, MAX_VALUE_LEN)}…` : trimmed
  }
  if (typeof v === "boolean") return v ? "вкл" : "выкл"
  if (typeof v === "number") return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return "—"
    const s = v.map((x) => String(x)).join(", ")
    return s.length > MAX_VALUE_LEN ? `${s.slice(0, MAX_VALUE_LEN)}…` : s
  }
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v)
      return s.length > MAX_VALUE_LEN ? `${s.slice(0, MAX_VALUE_LEN)}…` : s
    } catch { return "—" }
  }
  return String(v)
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === "string") return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v as object).length === 0
  return false
}

export interface SettingsMapResultRow {
  key: string
  title: string
  description?: string
  group: string
  level: SettingsRegistryEntry["level"]
  editPath: string | null
  effectiveValue: string
  origin: "default" | "company" | "vacancy" | "code"
  hardcoded?: true
  valueHint?: string
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const companyId = user.companyId
    const vacancyId = req.nextUrl.searchParams.get("vacancyId") || null

    // ── Общие данные, тянем один раз ──
    const [companyRow] = await db
      .select({
        hiringDefaultsJson:       companies.hiringDefaultsJson,
        followUpSendDelaySeconds: companies.followUpSendDelaySeconds,
        trashRetentionDays:       companies.trashRetentionDays,
        aiAbuseMode:              companies.aiAbuseMode,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    const hiringDefaults = (companyRow?.hiringDefaultsJson as CompanyHiringDefaults | null) ?? {}

    const effectiveMessages = await getEffectiveMessageDefaults(companyId)

    let vacancyRow: {
      id: string
      title: string
      descriptionJson: unknown
      scheduleInviteText: string | null
      stopWordsJson: unknown
      stopFactorsJson: unknown
      aiChatbotSettings: unknown
      firstMessagesChain: unknown
    } | null = null
    let specRow: Awaited<ReturnType<typeof getSpec>> = null
    let followUpCampaignRow: {
      customMessages: unknown
      customMessagesOpened: unknown
      minPortraitScoreEnabled: boolean
      minPortraitScore: number
    } | null = null
    let testDemoSettings: Record<string, unknown> | null = null
    let demoDemoSettings: Record<string, unknown> | null = null

    if (vacancyId) {
      const [row] = await db
        .select({
          id:                  vacancies.id,
          title:                vacancies.title,
          companyId:           vacancies.companyId,
          descriptionJson:      vacancies.descriptionJson,
          scheduleInviteText:   vacancies.scheduleInviteText,
          stopWordsJson:        vacancies.stopWordsJson,
          stopFactorsJson:      vacancies.stopFactorsJson,
          aiChatbotSettings:    vacancies.aiChatbotSettings,
          firstMessagesChain:   vacancies.firstMessagesChain,
        })
        .from(vacancies)
        .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
        .limit(1)
      if (row) {
        vacancyRow = row
        specRow = await getSpec(vacancyId)

        const [fc] = await db
          .select({
            customMessages:          followUpCampaigns.customMessages,
            customMessagesOpened:    followUpCampaigns.customMessagesOpened,
            minPortraitScoreEnabled: followUpCampaigns.minPortraitScoreEnabled,
            minPortraitScore:        followUpCampaigns.minPortraitScore,
          })
          .from(followUpCampaigns)
          .where(eq(followUpCampaigns.vacancyId, vacancyId))
          .limit(1)
        followUpCampaignRow = fc ?? null

        const demoRows = await db
          .select({ kind: demos.kind, postDemoSettings: demos.postDemoSettings })
          .from(demos)
          .where(and(eq(demos.vacancyId, vacancyId)))
        for (const d of demoRows) {
          if (d.kind === "test") testDemoSettings = (d.postDemoSettings as Record<string, unknown>) ?? {}
          if (d.kind === "demo") demoDemoSettings = (d.postDemoSettings as Record<string, unknown>) ?? {}
        }
      }
    }

    // ── Резолвинг одной записи ──
    async function resolveEntry(entry: SettingsRegistryEntry): Promise<SettingsMapResultRow> {
      const base: Pick<SettingsMapResultRow, "key" | "title" | "description" | "group" | "level" | "editPath" | "hardcoded"> = {
        key: entry.key,
        title: entry.title,
        description: entry.description,
        group: entry.group,
        level: entry.level,
        editPath: entry.editPath,
        hardcoded: entry.hardcoded,
      }

      if (entry.hardcoded || entry.resolve.kind === "code") {
        return { ...base, effectiveValue: entry.codeValue ?? "—", origin: "code" }
      }

      // Вакансия нужна, но не выбрана — подсказка вместо резолва.
      if (entry.level === "vacancy" && !vacancyId) {
        return { ...base, effectiveValue: "—", origin: "default", valueHint: "выберите вакансию" }
      }
      if (entry.level === "vacancy" && vacancyId && !vacancyRow) {
        return { ...base, effectiveValue: "—", origin: "default", valueHint: "вакансия не найдена" }
      }

      switch (entry.resolve.kind) {
        case "companyHiringDefaults": {
          const path = entry.resolve.path ?? ""
          const v = getByPath(hiringDefaults, path)
          const eff = isEmpty(v) ? entry.resolve.default : v
          const origin = isEmpty(v) ? "default" : "company"
          return { ...base, effectiveValue: formatValue(eff), origin }
        }

        case "platformSetting": {
          const key = entry.resolve.path ?? ""
          const [row] = await db
            .select({ value: platformSettings.value })
            .from(platformSettings)
            .where(eq(platformSettings.key, key))
            .limit(1)
          const v = row?.value
          const eff = isEmpty(v) ? entry.resolve.default : v
          return { ...base, effectiveValue: formatValue(eff), origin: isEmpty(v) ? "default" : "company" }
        }

        case "effectiveMessage": {
          const path = entry.resolve.path as keyof typeof effectiveMessages
          const companyLevelValue = effectiveMessages[path]
          // vacancy-оверрайд: тексты сообщений хранятся в aiProcessSettings /
          // firstMessagesChain на самой вакансии (см. lib/hh/sync-stage.ts).
          let vacancyOverride: unknown
          if (vacancyRow) {
            const descJson = (vacancyRow.descriptionJson as Record<string, unknown> | null) ?? {}
            const aiProcessSettings = (descJson as { aiProcessSettings?: Record<string, unknown> })?.aiProcessSettings
              ?? (getByPath(vacancyRow, "aiProcessSettings") as Record<string, unknown> | undefined)
            if (path === "inviteMessage") vacancyOverride = (aiProcessSettings as Record<string, unknown> | undefined)?.inviteMessage
            if (path === "rejectMessage") vacancyOverride = (aiProcessSettings as Record<string, unknown> | undefined)?.rejectMessage
            if (path === "offHoursMessage") vacancyOverride = undefined // отдельная колонка firstMessageOffHoursText, см. ниже
            if (path === "firstMessageDelaySeconds") {
              const chain = vacancyRow.firstMessagesChain as Array<{ delaySeconds?: number }> | null
              vacancyOverride = chain?.[0]?.delaySeconds
            }
          }
          if (!isEmpty(vacancyOverride)) {
            return { ...base, effectiveValue: formatValue(vacancyOverride), origin: "vacancy" }
          }
          // Компания задаёт свои messageDefaults — определим, действительно ли
          // company-уровень переопределяет платформенный (иначе это дефолт).
          const companyHd = (hiringDefaults.messageDefaults ?? {}) as Partial<Record<string, unknown>>
          const companyHasOwn = !isEmpty(companyHd[path])
          return {
            ...base,
            effectiveValue: formatValue(companyLevelValue),
            origin: companyHasOwn ? "company" : "default",
          }
        }

        case "spec": {
          if (!vacancyId || !specRow) {
            return { ...base, effectiveValue: formatValue(entry.resolve.default), origin: "default" }
          }
          const v = getByPath(specRow, entry.resolve.path ?? "")
          return { ...base, effectiveValue: formatValue(v ?? entry.resolve.default), origin: isEmpty(v) ? "default" : "vacancy" }
        }

        case "vacancy": {
          if (!vacancyRow) {
            return { ...base, effectiveValue: formatValue(entry.resolve.default), origin: "default" }
          }
          const path = entry.resolve.path ?? ""
          let v: unknown
          if (path.startsWith("followUpCampaign.")) {
            const sub = path.slice("followUpCampaign.".length)
            v = followUpCampaignRow ? getByPath(followUpCampaignRow, sub) : undefined
          } else if (path.startsWith("descriptionJson.")) {
            v = getByPath(vacancyRow.descriptionJson, path.slice("descriptionJson.".length))
          } else if (path.startsWith("aiChatbotSettings.")) {
            v = getByPath(vacancyRow.aiChatbotSettings, path.slice("aiChatbotSettings.".length))
          } else {
            v = getByPath(vacancyRow, path)
          }
          const eff = isEmpty(v) ? entry.resolve.default : v
          return { ...base, effectiveValue: formatValue(eff), origin: isEmpty(v) ? "default" : "vacancy" }
        }

        case "companyColumn": {
          const path = entry.resolve.path ?? ""
          const v = companyRow ? getByPath(companyRow, path) : undefined
          const eff = isEmpty(v) ? entry.resolve.default : v
          // Прямые колонки компании всегда имеют значение (NOT NULL default в
          // БД) — трактуем как "company", если оно отличается от дефолта кода,
          // иначе "default" (совпадает с платформенным/кодовым дефолтом).
          const origin = !isEmpty(v) && v !== entry.resolve.default ? "company" : "default"
          return { ...base, effectiveValue: formatValue(eff), origin }
        }

        case "demoSettings": {
          if (!vacancyId) {
            return { ...base, effectiveValue: formatValue(entry.resolve.default), origin: "default" }
          }
          const [demoKind, field] = (entry.resolve.path ?? "").split(":")
          const settings = demoKind === "test" ? testDemoSettings : demoKind === "demo" ? demoDemoSettings : null
          const v = settings ? settings[field] : undefined
          const eff = isEmpty(v) ? entry.resolve.default : v
          return { ...base, effectiveValue: formatValue(eff), origin: isEmpty(v) ? "default" : "vacancy" }
        }

        default:
          return { ...base, effectiveValue: "—", origin: "default" }
      }
    }

    const rows = await Promise.all(SETTINGS_REGISTRY.map(resolveEntry))

    // ── Список вакансий компании для дропдауна ──
    const vacancyOptionRows = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.companyId, companyId), isNull(vacancies.deletedAt)))
      .orderBy(vacancies.title)
      .limit(500)

    return apiSuccess({
      rows,
      vacancyOptions: vacancyOptionRows,
      selectedVacancyId: vacancyId,
    })
  } catch (err) {
    if (err instanceof Response) throw err
    console.error("[GET /settings-map]", err)
    return apiError("Не удалось построить карту настроек", 500)
  }
}
