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

  return NextResponse.json({ prefs })
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
