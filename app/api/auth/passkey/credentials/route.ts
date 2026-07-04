// GET  /api/auth/passkey/credentials      — список passkey текущего пользователя
// DELETE /api/auth/passkey/credentials?id= — удалить свой ключ
import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { webauthnCredentials } from "@/lib/db/schema"
import { requireAuth } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

async function currentUser() {
  return requireAuth()
}

export async function GET() {
  let user
  try { user = await currentUser() } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.id) return NextResponse.json({ credentials: [] })

  const rows = await db
    .select({
      id: webauthnCredentials.id,
      deviceName: webauthnCredentials.deviceName,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, user.id))
    .orderBy(desc(webauthnCredentials.createdAt))

  return NextResponse.json({ credentials: rows })
}

export async function DELETE(req: NextRequest) {
  let user
  try { user = await currentUser() } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.id) return NextResponse.json({ error: "Нет пользователя" }, { status: 400 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 })

  await db.delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, user.id)))

  return NextResponse.json({ ok: true })
}
