import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { outreachIntegrations } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireOutreachAccess } from "@/lib/outreach/access"
import { testConnection, providerConfigured } from "@/lib/outreach/provider"

function mask(key?: string | null): string {
  if (!key) return ""
  return key.length <= 6 ? "••••" : key.slice(0, 3) + "••••" + key.slice(-3)
}

// GET — текущее подключение компании (ключ замаскирован).
export async function GET() {
  try {
    const user = await requireOutreachAccess()
    const row = await db.select().from(outreachIntegrations)
      .where(eq(outreachIntegrations.companyId, user.companyId)).limit(1)
    const it = row[0]
    return apiSuccess({
      configured: providerConfigured(),
      connected: it?.status === "connected",
      status: it?.status ?? "disconnected",
      keyMasked: mask(it?.apiKey),
      label: it?.label ?? "",
      lastCheckAt: it?.lastCheckAt ?? null,
      lastError: it?.lastError ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка загрузки настроек", 500)
  }
}

// POST { apiKey, label } — сохранить подключение клиента + проверить ключ.
export async function POST(req: NextRequest) {
  try {
    const user = await requireOutreachAccess()
    const body = await req.json().catch(() => ({}))
    const apiKey = String(body.apiKey ?? "").trim()
    const label = String(body.label ?? "").trim() || null
    if (!apiKey) return apiError("Укажите ключ подключения", 400)

    const test = await testConnection(apiKey)
    const status = test.ok ? "connected" : "error"

    await db.insert(outreachIntegrations).values({
      companyId: user.companyId, apiKey, label, status,
      lastCheckAt: new Date(), lastError: test.ok ? null : (test.error ?? "Ошибка"),
      connectedBy: user.id ?? null,
    }).onConflictDoUpdate({
      target: outreachIntegrations.companyId,
      set: {
        apiKey, label, status,
        lastCheckAt: new Date(), lastError: test.ok ? null : (test.error ?? "Ошибка"),
        updatedAt: new Date(),
      },
    })

    return apiSuccess({ connected: test.ok, status, error: test.ok ? null : test.error })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[email-marketing/settings]", err)
    return apiError("Ошибка сохранения настроек", 500)
  }
}
