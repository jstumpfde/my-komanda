// CRUD-эндпоинт настроек интеграции Авито для текущей компании.
//
// GET  /api/integrations/avito — получить статус интеграции
// POST /api/integrations/avito — сохранить ключи (client_id/secret, user_id)
// DELETE /api/integrations/avito — отключить (isEnabled=false, ключи сохраняются)

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { avitoIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// ─── GET: статус интеграции ───────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [row] = await db
    .select({
      id:             avitoIntegrations.id,
      userId:         avitoIntegrations.userId,
      // client_id показываем (не секрет), client_secret НЕ возвращаем на клиент
      clientId:       avitoIntegrations.clientId,
      isEnabled:      avitoIntegrations.isEnabled,
      isActive:       avitoIntegrations.isActive,
      // Есть ли сохранённый секрет — только булево
      hasSecret:      avitoIntegrations.clientSecret,
      // Есть ли действующий токен
      hasToken:       avitoIntegrations.accessToken,
      tokenExpiresAt: avitoIntegrations.tokenExpiresAt,
      lastSyncedAt:   avitoIntegrations.lastSyncedAt,
      connectedBy:    avitoIntegrations.connectedBy,
      createdAt:      avitoIntegrations.createdAt,
    })
    .from(avitoIntegrations)
    .where(eq(avitoIntegrations.companyId, session.user.companyId))
    .limit(1)

  if (!row) {
    return NextResponse.json({ configured: false })
  }

  return NextResponse.json({
    configured:     true,
    isEnabled:      row.isEnabled,
    isActive:       row.isActive,
    userId:         row.userId,
    clientId:       row.clientId,
    hasSecret:      Boolean(row.hasSecret?.trim()),
    hasToken:       Boolean(row.hasToken?.trim()),
    tokenExpiresAt: row.tokenExpiresAt,
    lastSyncedAt:   row.lastSyncedAt,
    createdAt:      row.createdAt,
  })
}

// ─── POST: сохранить / обновить настройки ────────────────────────────────────

interface AvitoSaveBody {
  clientId?:     string
  clientSecret?: string
  userId?:       string
  isEnabled?:    boolean
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId || !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: AvitoSaveBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 })
  }

  const { clientId, clientSecret, userId, isEnabled } = body

  // Проверяем, есть ли уже запись
  const [existing] = await db
    .select({ id: avitoIntegrations.id })
    .from(avitoIntegrations)
    .where(eq(avitoIntegrations.companyId, session.user.companyId))
    .limit(1)

  const now = new Date()

  if (existing) {
    // Обновляем существующую запись.
    // client_secret обновляем только если пришёл непустой (иначе оставляем старый).
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    }
    if (clientId !== undefined)    updateData.clientId    = clientId?.trim() || null
    if (userId  !== undefined)     updateData.userId      = userId?.trim()   || null
    if (isEnabled !== undefined)   updateData.isEnabled   = isEnabled
    if (clientSecret?.trim())      updateData.clientSecret = clientSecret.trim()

    // При изменении ключей сбрасываем кэшированный токен
    if (clientId !== undefined || clientSecret?.trim()) {
      updateData.accessToken    = null
      updateData.tokenExpiresAt = null
    }

    await db
      .update(avitoIntegrations)
      .set(updateData)
      .where(eq(avitoIntegrations.companyId, session.user.companyId))
  } else {
    // Создаём новую запись
    await db.insert(avitoIntegrations).values({
      companyId:    session.user.companyId,
      clientId:     clientId?.trim() || null,
      clientSecret: clientSecret?.trim() || null,
      userId:       userId?.trim() || null,
      isEnabled:    isEnabled ?? false,
      connectedBy:  session.user.id,
      createdAt:    now,
      updatedAt:    now,
    })
  }

  return NextResponse.json({ ok: true })
}

// ─── DELETE: отключить интеграцию ────────────────────────────────────────────

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await db
    .update(avitoIntegrations)
    .set({
      isEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(avitoIntegrations.companyId, session.user.companyId))

  return NextResponse.json({ ok: true })
}
