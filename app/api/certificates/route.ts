import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { certificates, courses } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

export async function GET() {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const rows = await db
    .select({
      id: certificates.id,
      number: certificates.number,
      issuedAt: certificates.issuedAt,
      validUntil: certificates.validUntil,
      pdfUrl: certificates.pdfUrl,
      employeeId: certificates.employeeId,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(certificates)
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .where(eq(courses.tenantId, user.companyId))
    .orderBy(desc(certificates.issuedAt))

  return NextResponse.json(rows)
}
