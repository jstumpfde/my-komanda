// Выборка шаблонов ролей, видимых тенанту: системные (is_system=true) + свои.
// По образцу demo_templates/questionnaire_templates. Применение к вакансии — ТЗ №3.

import { and, or, eq, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { roleTemplates } from "@/lib/db/schema"
import type { RoleTemplateRow } from "./types"

/** Системные + собственные шаблоны ролей тенанта (активные, не в корзине). */
export async function getRoleTemplatesForTenant(companyId: string): Promise<RoleTemplateRow[]> {
  const rows = await db
    .select()
    .from(roleTemplates)
    .where(
      and(
        or(eq(roleTemplates.isSystem, true), eq(roleTemplates.tenantId, companyId)),
        isNull(roleTemplates.deletedAt),
      ),
    )
    .orderBy(desc(roleTemplates.isSystem), desc(roleTemplates.createdAt))

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    roleCategory: r.roleCategory,
    isSystem: r.isSystem,
    tenantId: r.tenantId,
    questionnaireTemplateId: r.questionnaireTemplateId,
    demoTemplateId: r.demoTemplateId,
    specTemplate: r.specTemplate ?? {},
    funnelV2Template: r.funnelV2Template ?? [],
    scoringFormula: r.scoringFormula ?? {},
    isPublished: r.isPublished,
    createdAt: r.createdAt,
  }))
}
