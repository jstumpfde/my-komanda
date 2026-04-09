import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhIntegrations, hhVacancies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { getEmployerVacancies } from "@/lib/hh-api"

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
      .from(hhVacancies)
      .where(eq(hhVacancies.companyId, companyId))

    return NextResponse.json({ vacancies: cached, fromCache: true })
  }

  try {
    const { accessToken, integration } = tokenResult
    const data = await getEmployerVacancies(accessToken, integration.employerId)

    for (const item of data.items) {
      const values = {
        companyId,
        hhVacancyId: item.id,
        title: item.name,
        areaName: item.area?.name ?? null,
        salaryFrom: item.salary?.from ?? null,
        salaryTo: item.salary?.to ?? null,
        salaryCurrency: item.salary?.currency ?? null,
        status: item.status?.id ?? "open",
        responsesCount: item.counters?.responses ?? 0,
        url: item.alternate_url ?? null,
        rawData: item as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }

      await db
        .insert(hhVacancies)
        .values(values)
        .onConflictDoUpdate({
          target: [hhVacancies.companyId, hhVacancies.hhVacancyId],
          set: values,
        })
    }

    await db
      .update(hhIntegrations)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(hhIntegrations.id, integration.id))

    const vacancies = await db
      .select()
      .from(hhVacancies)
      .where(eq(hhVacancies.companyId, companyId))

    return NextResponse.json({ vacancies, fromCache: false })
  } catch (err) {
    console.error("[hh/vacancies]", err)

    const cached = await db
      .select()
      .from(hhVacancies)
      .where(eq(hhVacancies.companyId, companyId))

    return NextResponse.json({ vacancies: cached, fromCache: true, error: "sync_failed" })
  }
}
