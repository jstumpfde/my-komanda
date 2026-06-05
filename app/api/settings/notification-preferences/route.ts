import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notificationPreferences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, session.user.id))

  // Дефолт мастер-тумблера «Все уведомления» = ВКЛ.
  // Если пользователь ни разу не трогал __system:all_enabled, записи в БД нет.
  // Возвращаем синтетическую строку с channelEmail=true, чтобы фронт показывал «ВКЛ».
  // Когда пользователь явно переключит тумблер — PUT запишет реальную строку,
  // и следующий GET вернёт её (channelEmail=true или false) вместо синтетической.
  const hasSysRow = prefs.some(
    (p) => p.module === "__system" && p.category === "all_enabled"
  )
  const prefsForUI = hasSysRow
    ? prefs
    : [
        ...prefs,
        {
          id: "00000000-0000-0000-0000-000000000000",
          userId: session.user.id,
          module: "__system",
          category: "all_enabled",
          channelEmail: true,
          channelTelegram: false,
          channelPush: false,
          channelWeb: true,
          createdAt: null,
          updatedAt: null,
        } as (typeof prefs)[number],
      ]

  return NextResponse.json({ prefs: prefsForUI })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { prefs } = await req.json() as {
    prefs: Array<{
      module: string; category: string
      channelEmail: boolean; channelTelegram: boolean
      channelPush: boolean; channelWeb: boolean
    }>
  }

  for (const p of prefs) {
    await db
      .insert(notificationPreferences)
      .values({ userId: session.user.id, ...p, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.module, notificationPreferences.category],
        set: {
          channelEmail: p.channelEmail,
          channelTelegram: p.channelTelegram,
          channelPush: p.channelPush,
          channelWeb: p.channelWeb,
          updatedAt: new Date(),
        },
      })
  }

  return NextResponse.json({ ok: true })
}
