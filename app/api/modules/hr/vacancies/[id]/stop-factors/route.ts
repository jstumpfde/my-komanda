// GET/PUT /api/modules/hr/vacancies/[id]/stop-factors
//
// #61: чтение и сохранение per-vacancy стоп-факторов. Логика применения
// (process-queue → стоп-фактор → отказ кандидату) пока НЕ подключена —
// см. эскейп-клаузу в задаче. Этот эндпоинт занимается только хранением.

import { NextRequest } from "next/server"
import { eq, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import type { VacancyStopFactors } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

const ALLOWED_FORMATS = new Set(["office", "hybrid", "remote"])

function clamp(n: unknown, min: number, max: number): number | undefined {
  const v = Number(n)
  if (!Number.isFinite(v)) return undefined
  return Math.max(min, Math.min(max, Math.round(v)))
}

function trimText(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : ""
}

function stringArray(v: unknown, max = 64): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 200).slice(0, max)
}

function sanitize(input: unknown): VacancyStopFactors {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const src = input as Record<string, Record<string, unknown> | undefined>
  const out: VacancyStopFactors = {}

  if (src.city) {
    out.city = {
      enabled:        Boolean(src.city.enabled),
      allowedCities:  stringArray(src.city.allowedCities),
      allowRelocation: Boolean(src.city.allowRelocation),
      rejectionText:  trimText(src.city.rejectionText),
    }
  }
  if (src.format) {
    const formats = stringArray(src.format.allowedFormats).filter(f => ALLOWED_FORMATS.has(f)) as Array<"office" | "hybrid" | "remote">
    out.format = {
      enabled:        Boolean(src.format.enabled),
      allowedFormats: formats,
      rejectionText:  trimText(src.format.rejectionText),
    }
  }
  if (src.age) {
    out.age = {
      enabled:       Boolean(src.age.enabled),
      minAge:        clamp(src.age.minAge, 14, 100),
      maxAge:        clamp(src.age.maxAge, 14, 100),
      rejectionText: trimText(src.age.rejectionText),
    }
  }
  if (src.experience) {
    out.experience = {
      enabled:       Boolean(src.experience.enabled),
      minYears:      clamp(src.experience.minYears, 0, 50),
      rejectionText: trimText(src.experience.rejectionText),
    }
  }
  if (src.documents) {
    out.documents = {
      enabled:       Boolean(src.documents.enabled),
      required:      stringArray(src.documents.required),
      rejectionText: trimText(src.documents.rejectionText),
    }
  }
  if (src.citizenship) {
    out.citizenship = {
      enabled:       Boolean(src.citizenship.enabled),
      // mode/denied — deny-режим «Исключить страны/континенты» (03.07).
      // Гвард: sanitize их вырезал → deny-настройка молча терялась при
      // сохранении через таб «Воронка» (spec-путь сохранял корректно).
      mode:          src.citizenship.mode === "deny" ? "deny" as const : undefined,
      allowed:       stringArray(src.citizenship.allowed),
      denied:        stringArray(src.citizenship.denied),
      rejectionText: trimText(src.citizenship.rejectionText),
    }
  }
  if (src.salaryExpectation) {
    out.salaryExpectation = {
      enabled:       Boolean(src.salaryExpectation.enabled),
      maxAmount:     clamp(src.salaryExpectation.maxAmount, 0, 100_000_000),
      rejectionText: trimText(src.salaryExpectation.rejectionText),
    }
  }
  return out
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireCompany()
    const [row] = await db
      .select({ stopFactorsJson: vacancies.stopFactorsJson })
      .from(vacancies)
      .where(and(
        eq(vacancies.id, id),
        eq(vacancies.companyId, user.companyId),
        isNull(vacancies.deletedAt),
      ))
      .limit(1)
    if (!row) return apiError("Vacancy not found", 404)
    return apiSuccess({ stopFactors: (row.stopFactorsJson ?? {}) as VacancyStopFactors })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET stop-factors]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as { stopFactors?: unknown }
    const sanitized = sanitize(body.stopFactors)

    const [updated] = await db
      .update(vacancies)
      .set({ stopFactorsJson: sanitized })
      .where(and(
        eq(vacancies.id, id),
        eq(vacancies.companyId, user.companyId),
        isNull(vacancies.deletedAt),
      ))
      .returning({ stopFactorsJson: vacancies.stopFactorsJson })
    if (!updated) return apiError("Vacancy not found", 404)
    return apiSuccess({ ok: true, stopFactors: updated.stopFactorsJson })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT stop-factors]", err)
    return apiError("Internal server error", 500)
  }
}
