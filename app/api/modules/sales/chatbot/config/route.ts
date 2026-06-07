import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesBotConfigs } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  resolveSalesChatbotSettings,
  type SalesChatbotSettings,
} from "@/lib/ai/sales-chatbot-settings"

// ---------------------------------------------------------------------------
// GET — вернуть конфиг тенанта (или дефолтный объект, если строки нет)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const user = await requireCompany()

    const [row] = await db
      .select()
      .from(salesBotConfigs)
      .where(eq(salesBotConfigs.tenantId, user.companyId))
      .limit(1)

    if (!row) {
      // Строки нет — возвращаем дефолтный объект, НЕ создавая строку в БД
      return apiSuccess({
        isEnabled: true,
        botName: "",
        greeting: "",
        systemPrompt: "",
        settings: resolveSalesChatbotSettings(null),
      })
    }

    // Строка есть — settings прогоняем через resolve, чтобы фронт получил полный эффективный конфиг
    return apiSuccess({
      ...row,
      settings: resolveSalesChatbotSettings(row.settings as SalesChatbotSettings | null),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ---------------------------------------------------------------------------
// PUT — upsert конфига тенанта (create or update)
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const {
      isEnabled,
      botName,
      greeting,
      systemPrompt,
      settings,
    }: {
      isEnabled?: boolean
      botName?: string
      greeting?: string
      systemPrompt?: string
      settings?: SalesChatbotSettings
    } = body

    const now = new Date()

    // Upsert: вставить или обновить по tenantId
    const [upserted] = await db
      .insert(salesBotConfigs)
      .values({
        tenantId: user.companyId,
        isEnabled: isEnabled ?? true,
        botName: botName ?? "",
        greeting: greeting ?? "",
        systemPrompt: systemPrompt ?? "",
        settings: settings ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: salesBotConfigs.tenantId,
        set: {
          ...(isEnabled !== undefined && { isEnabled }),
          ...(botName !== undefined && { botName }),
          ...(greeting !== undefined && { greeting }),
          ...(systemPrompt !== undefined && { systemPrompt }),
          ...(settings !== undefined && { settings }),
          updatedAt: now,
        },
      })
      .returning()

    return apiSuccess(upserted)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ---------------------------------------------------------------------------
// DELETE — сбросить конфиг (удалить строку, вернуть к дефолтам)
// ---------------------------------------------------------------------------

export async function DELETE() {
  try {
    const user = await requireCompany()

    await db
      .delete(salesBotConfigs)
      .where(eq(salesBotConfigs.tenantId, user.companyId))

    return apiSuccess({ message: "Конфигурация сброшена до дефолтных значений" })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
