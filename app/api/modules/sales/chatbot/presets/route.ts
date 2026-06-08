import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesBotPresets } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { type SalesChatbotSettings } from "@/lib/ai/sales-chatbot-settings"

// ---------------------------------------------------------------------------
// GET — список пресетов тенанта (полные settings, чтобы UI мог применить)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select()
      .from(salesBotPresets)
      .where(eq(salesBotPresets.tenantId, user.companyId))
      .orderBy(salesBotPresets.createdAt)

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// ---------------------------------------------------------------------------
// POST — создать новый пресет
// Body: { name (обязателен), settings: SalesChatbotSettings, isDefault?: boolean }
// Если isDefault=true — снять флаг у остальных пресетов тенанта.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const {
      name,
      settings,
      isDefault = false,
    }: {
      name?: string
      settings?: SalesChatbotSettings
      isDefault?: boolean
    } = body

    if (!name || typeof name !== "string" || name.trim() === "") {
      return apiError("Поле «name» обязательно", 400)
    }
    if (!settings || typeof settings !== "object") {
      return apiError("Поле «settings» обязательно", 400)
    }

    const now = new Date()

    // Если новый пресет становится дефолтом — снимаем флаг у остальных
    if (isDefault) {
      await db
        .update(salesBotPresets)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(salesBotPresets.tenantId, user.companyId))
    }

    const [created] = await db
      .insert(salesBotPresets)
      .values({
        tenantId: user.companyId,
        name: name.trim(),
        settings: settings as Record<string, unknown>,
        isDefault,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// ---------------------------------------------------------------------------
// PATCH — обновить пресет (id в body). Менять: name, settings, isDefault.
// Если isDefault=true — снять у остальных. Только свой tenantId.
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const {
      id,
      name,
      settings,
      isDefault,
    }: {
      id?: string
      name?: string
      settings?: SalesChatbotSettings
      isDefault?: boolean
    } = body

    if (!id || typeof id !== "string") {
      return apiError("Поле «id» обязательно", 400)
    }

    // Проверяем, что пресет принадлежит тенанту
    const [existing] = await db
      .select()
      .from(salesBotPresets)
      .where(
        and(
          eq(salesBotPresets.id, id),
          eq(salesBotPresets.tenantId, user.companyId),
        ),
      )
      .limit(1)

    if (!existing) {
      return apiError("Пресет не найден", 404)
    }

    const now = new Date()

    // Если пресет становится дефолтом — снимаем флаг у остальных
    if (isDefault === true) {
      await db
        .update(salesBotPresets)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(salesBotPresets.tenantId, user.companyId))
    }

    const updateData: Partial<{
      name: string
      settings: Record<string, unknown>
      isDefault: boolean
      updatedAt: Date
    }> = { updatedAt: now }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return apiError("Поле «name» не может быть пустым", 400)
      }
      updateData.name = name.trim()
    }
    if (settings !== undefined) {
      if (typeof settings !== "object" || settings === null) {
        return apiError("Поле «settings» должно быть объектом", 400)
      }
      updateData.settings = settings as Record<string, unknown>
    }
    if (isDefault !== undefined) {
      updateData.isDefault = isDefault
    }

    const [updated] = await db
      .update(salesBotPresets)
      .set(updateData)
      .where(
        and(
          eq(salesBotPresets.id, id),
          eq(salesBotPresets.tenantId, user.companyId),
        ),
      )
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// ---------------------------------------------------------------------------
// DELETE — удалить пресет (id в body). Только свой tenantId.
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const { id }: { id?: string } = body

    if (!id || typeof id !== "string") {
      return apiError("Поле «id» обязательно", 400)
    }

    // Удаляем только если пресет принадлежит тенанту
    const [deleted] = await db
      .delete(salesBotPresets)
      .where(
        and(
          eq(salesBotPresets.id, id),
          eq(salesBotPresets.tenantId, user.companyId),
        ),
      )
      .returning()

    if (!deleted) {
      return apiError("Пресет не найден", 404)
    }

    return apiSuccess({ message: "Пресет удалён" })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
