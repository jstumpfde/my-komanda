import { NextRequest } from "next/server"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyFollowupPresets } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { isFollowUpPreset } from "@/lib/followup/presets"
import { buildSystemPresets, sanitizeMessages, type FollowupPresetDTO } from "@/lib/followup/presets-library"

function rowToDTO(r: typeof companyFollowupPresets.$inferSelect): FollowupPresetDTO {
  return {
    id:                 r.id,
    system:             false,
    name:               r.name,
    description:        r.description,
    preset:             isFollowUpPreset(r.preset) ? r.preset : "standard",
    customDays:         r.customDays ?? null,
    messages:           r.messages ?? null,
    messagesOpened:     r.messagesOpened ?? null,
    testPreset:         r.testPreset ?? null,
    testMessages:       r.testMessages ?? null,
    testMessagesOpened: r.testMessagesOpened ?? null,
  }
}

// GET — список пресетов: системные (виртуальные, read-only) + свои.
export async function GET() {
  try {
    const user = await requireCompany()
    const own = await db
      .select()
      .from(companyFollowupPresets)
      .where(eq(companyFollowupPresets.companyId, user.companyId))
      .orderBy(desc(companyFollowupPresets.updatedAt))
    return apiSuccess({ system: buildSystemPresets(), own: own.map(rowToDTO) })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[followup-presets GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST — создать свой пресет (в т.ч. копией: клиент шлёт полный payload).
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const name = (typeof body.name === "string" ? body.name : "").trim().slice(0, 120) || "Новый пресет"
    const preset = isFollowUpPreset(body.preset) ? body.preset : "standard"
    const customDays = Array.isArray(body.customDays)
      ? body.customDays.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 1 && d <= 365)
      : null

    const [created] = await db
      .insert(companyFollowupPresets)
      .values({
        companyId:          user.companyId,
        name,
        description:        typeof body.description === "string" ? body.description.slice(0, 500) : null,
        preset,
        customDays:         customDays && customDays.length > 0 ? customDays : null,
        messages:           sanitizeMessages(body.messages),
        messagesOpened:     sanitizeMessages(body.messagesOpened),
        testPreset:         isFollowUpPreset(body.testPreset) ? (body.testPreset as string) : null,
        testMessages:       sanitizeMessages(body.testMessages),
        testMessagesOpened: sanitizeMessages(body.testMessagesOpened),
        createdBy:          user.id as string,
      })
      .returning({ id: companyFollowupPresets.id })

    return apiSuccess({ id: created.id }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[followup-presets POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
