import { NextRequest } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { trainingScenarios } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { TRAINING_PRESETS } from "@/lib/knowledge/training-presets"

// GET  — список сценариев тенанта (+ авто-сид 3 пресетов при первом заходе)
// POST — создать кастомный сценарий

async function seedPresetsIfEmpty(tenantId: string, userId: string | null) {
  const existing = await db
    .select({ id: trainingScenarios.id })
    .from(trainingScenarios)
    .where(and(eq(trainingScenarios.tenantId, tenantId), eq(trainingScenarios.isPreset, true)))
    .limit(1)

  if (existing.length > 0) return

  for (const preset of TRAINING_PRESETS) {
    await db.insert(trainingScenarios).values({
      tenantId,
      title: preset.title,
      description: preset.description,
      type: preset.type,
      difficulty: preset.difficulty,
      systemPrompt: preset.systemPrompt,
      criteria: preset.criteria,
      isPreset: true,
      createdBy: userId,
    })
  }
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    await seedPresetsIfEmpty(user.companyId, user.id)

    const rows = await db
      .select({
        id: trainingScenarios.id,
        title: trainingScenarios.title,
        description: trainingScenarios.description,
        type: trainingScenarios.type,
        difficulty: trainingScenarios.difficulty,
        isPreset: trainingScenarios.isPreset,
        relatedArticleId: trainingScenarios.relatedArticleId,
        createdAt: trainingScenarios.createdAt,
      })
      .from(trainingScenarios)
      .where(eq(trainingScenarios.tenantId, user.companyId))
      .orderBy(desc(trainingScenarios.isPreset), desc(trainingScenarios.createdAt))

    return apiSuccess({ scenarios: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/training] GET", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as {
      title?: string
      description?: string
      type?: string
      difficulty?: string
      systemPrompt?: string
      criteria?: { key: string; label: string }[]
      relatedArticleId?: string
    }

    if (!body.title?.trim()) return apiError("'title' обязателен", 400)
    if (!body.systemPrompt?.trim()) return apiError("'systemPrompt' обязателен", 400)

    const [created] = await db
      .insert(trainingScenarios)
      .values({
        tenantId: user.companyId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        type: body.type ?? "custom",
        difficulty: body.difficulty ?? "medium",
        systemPrompt: body.systemPrompt,
        criteria: Array.isArray(body.criteria) ? body.criteria : [],
        relatedArticleId: body.relatedArticleId || null,
        isPreset: false,
        createdBy: user.id,
      })
      .returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/training] POST", err)
    return apiError("Internal server error", 500)
  }
}
