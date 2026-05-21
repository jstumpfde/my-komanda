import { NextRequest } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import type { AnketaAutoReplySettings, PostDemoSettings } from "@/lib/db/schema"
import { ANKETA_AUTO_REPLY_DELAYS } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const ANKETA_DELAY_SET = new Set<number>(ANKETA_AUTO_REPLY_DELAYS)

function isHttpUrlOrEmpty(v: unknown): v is string {
  if (typeof v !== "string") return false
  if (v.length === 0) return true
  try {
    const u = new URL(v)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function sanitizeAnketaAutoReply(
  current: AnketaAutoReplySettings | undefined,
  incoming: unknown,
): AnketaAutoReplySettings | undefined {
  if (!incoming || typeof incoming !== "object") return current
  const src = incoming as Record<string, unknown>
  const next: AnketaAutoReplySettings = { ...(current ?? {}) }

  if (src.enabled !== undefined) next.enabled = Boolean(src.enabled)
  if (src.delayMinutes !== undefined) {
    const n = Number(src.delayMinutes)
    if (Number.isFinite(n) && ANKETA_DELAY_SET.has(n)) {
      next.delayMinutes = n as AnketaAutoReplySettings["delayMinutes"]
    }
  }
  if (src.respectSchedule !== undefined) next.respectSchedule = Boolean(src.respectSchedule)
  if (src.text !== undefined && typeof src.text === "string") {
    next.text = src.text.slice(0, 2000)
  }
  if (src.testTaskUrl !== undefined && isHttpUrlOrEmpty(src.testTaskUrl)) {
    next.testTaskUrl = (src.testTaskUrl as string).slice(0, 500)
  }
  return next
}

export { PUT as PATCH }

async function getOwnedDemo(vacancyId: string, companyId: string) {
  const [row] = await db
    .select({
      id: demos.id,
      postDemoSettings: demos.postDemoSettings,
    })
    .from(demos)
    .innerJoin(vacancies, eq(demos.vacancyId, vacancies.id))
    .where(and(eq(demos.vacancyId, vacancyId), eq(vacancies.companyId, companyId)))
    .orderBy(sql`${demos.updatedAt} DESC`)
    .limit(1)

  return row ?? null
}

function trim(v: unknown, max = 2000): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined
}

function clampScore(v: unknown): number | undefined {
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return Math.max(0, Math.min(100, Math.round(n)))
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const demo = await getOwnedDemo(id, user.companyId)
    if (!demo) return apiSuccess({ settings: {} as PostDemoSettings })

    const settings = (demo.postDemoSettings as PostDemoSettings | null) ?? {}
    return apiSuccess({ settings })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[post-demo-settings GET] error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const demo = await getOwnedDemo(id, user.companyId)
    if (!demo) return apiError("Демо не найдено для вакансии", 404)

    const body = await req.json().catch(() => ({})) as Partial<PostDemoSettings>
    const current = (demo.postDemoSettings as PostDemoSettings | null) ?? {}
    const settings: PostDemoSettings = { ...current }

    if (body.enabled !== undefined) {
      settings.enabled = Boolean(body.enabled)
    }

    if (body.mode !== undefined) {
      settings.mode = body.mode === "manual" ? "manual" : "auto"
    }
    if (body.upperThreshold !== undefined) {
      const n = clampScore(body.upperThreshold)
      if (n !== undefined) settings.upperThreshold = n
    }
    if (body.lowerThreshold !== undefined) {
      const n = clampScore(body.lowerThreshold)
      if (n !== undefined) settings.lowerThreshold = n
    }
    if (body.greenTitle !== undefined) settings.greenTitle = trim(body.greenTitle, 200)
    if (body.meetPhone !== undefined) settings.meetPhone = Boolean(body.meetPhone)
    if (body.meetOnline !== undefined) settings.meetOnline = Boolean(body.meetOnline)
    if (body.meetOffice !== undefined) settings.meetOffice = Boolean(body.meetOffice)
    if (body.officeAddress !== undefined) settings.officeAddress = trim(body.officeAddress, 500)
    if (body.yellowTitle !== undefined) settings.yellowTitle = trim(body.yellowTitle, 200)
    if (body.yellowText !== undefined) settings.yellowText = trim(body.yellowText, 2000)
    if (body.redTitle !== undefined) settings.redTitle = trim(body.redTitle, 200)
    if (body.redText !== undefined) settings.redText = trim(body.redText, 2000)
    if (body.manualTitle !== undefined) settings.manualTitle = trim(body.manualTitle, 200)
    if (body.manualText !== undefined) settings.manualText = trim(body.manualText, 2000)
    if (body.manualButton !== undefined) settings.manualButton = trim(body.manualButton, 200)
    if (body.manualButtonEnabled !== undefined) settings.manualButtonEnabled = Boolean(body.manualButtonEnabled)
    if (body.greenButtonEnabled !== undefined) settings.greenButtonEnabled = Boolean(body.greenButtonEnabled)

    if ((body as { anketaAutoReply?: unknown }).anketaAutoReply !== undefined) {
      const sanitized = sanitizeAnketaAutoReply(
        settings.anketaAutoReply,
        (body as { anketaAutoReply?: unknown }).anketaAutoReply,
      )
      if (sanitized) settings.anketaAutoReply = sanitized
    }

    if (body.formFields !== undefined && body.formFields && typeof body.formFields === "object") {
      const allowed = ["firstName", "lastName", "email", "phone", "telegram", "birthDate", "city"] as const
      const next: NonNullable<PostDemoSettings["formFields"]> = { ...(settings.formFields ?? {}) }
      for (const key of allowed) {
        const f = (body.formFields as Record<string, unknown>)[key]
        if (f && typeof f === "object") {
          const ff = f as { enabled?: unknown; required?: unknown }
          next[key] = {
            enabled: Boolean(ff.enabled),
            required: Boolean(ff.required),
          }
        }
      }
      settings.formFields = next
    }

    await db
      .update(demos)
      .set({ postDemoSettings: settings, updatedAt: new Date() })
      .where(eq(demos.id, demo.id))

    return apiSuccess({ ok: true, settings })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[post-demo-settings PUT] error:", err)
    return apiError("Internal server error", 500)
  }
}
