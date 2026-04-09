import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [integration] = await db
    .select({
      id: hhIntegrations.id,
      employerId: hhIntegrations.employerId,
      employerName: hhIntegrations.employerName,
      isActive: hhIntegrations.isActive,
      lastSyncedAt: hhIntegrations.lastSyncedAt,
      createdAt: hhIntegrations.createdAt,
    })
    .from(hhIntegrations)
    .where(eq(hhIntegrations.companyId, session.user.companyId))
    .limit(1)

  if (!integration || !integration.isActive) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    employerId: integration.employerId,
    employerName: integration.employerName,
    lastSyncedAt: integration.lastSyncedAt,
    connectedAt: integration.createdAt,
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await db
    .update(hhIntegrations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(hhIntegrations.companyId, session.user.companyId),
      eq(hhIntegrations.isActive, true),
    ))

  return NextResponse.json({ ok: true })
}
