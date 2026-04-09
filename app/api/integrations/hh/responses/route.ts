import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations, hhResponses } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { getNegotiations } from "@/lib/hh-api"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const companyId = session.user.companyId
  const tokenResult = await getValidToken(companyId)

  if (!tokenResult) {
    const cached = await db
      .select()
      .from(hhResponses)
      .where(eq(hhResponses.companyId, companyId))

    return NextResponse.json({ responses: cached, fromCache: true })
  }

  try {
    const { accessToken, integration } = tokenResult
    const data = await getNegotiations(accessToken)

    for (const item of data.items) {
      const candidateName = [
        item.resume?.last_name,
        item.resume?.first_name,
        item.resume?.middle_name,
      ].filter(Boolean).join(" ") || null

      const values = {
        companyId,
        hhVacancyId: item.vacancy.id,
        hhResponseId: item.id,
        candidateName,
        candidatePhone: item.phone ?? null,
        candidateEmail: item.email ?? null,
        resumeTitle: item.resume?.title ?? null,
        resumeUrl: item.resume?.alternate_url ?? null,
        status: item.state.id,
        rawData: item as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }

      await db
        .insert(hhResponses)
        .values(values)
        .onConflictDoUpdate({
          target: [hhResponses.companyId, hhResponses.hhResponseId],
          set: values,
        })
    }

    await db
      .update(hhIntegrations)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(hhIntegrations.id, integration.id))

    const responses = await db
      .select()
      .from(hhResponses)
      .where(eq(hhResponses.companyId, companyId))

    return NextResponse.json({ responses, fromCache: false })
  } catch (err) {
    console.error("[hh/responses]", err)

    const cached = await db
      .select()
      .from(hhResponses)
      .where(eq(hhResponses.companyId, companyId))

    return NextResponse.json({ responses: cached, fromCache: true, error: "sync_failed" })
  }
}
