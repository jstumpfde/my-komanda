// Придержанные стражем сообщения (Option 2). GET — список held своей компании.
import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { heldMessages, candidates } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select({
        id:           heldMessages.id,
        messageText:  heldMessages.messageText,
        issues:       heldMessages.issues,
        source:       heldMessages.source,
        createdAt:    heldMessages.createdAt,
        candidateId:  heldMessages.candidateId,
        candidateName: candidates.name,
      })
      .from(heldMessages)
      .leftJoin(candidates, eq(candidates.id, heldMessages.candidateId))
      .where(and(eq(heldMessages.companyId, user.companyId), eq(heldMessages.status, "held")))
      .orderBy(desc(heldMessages.createdAt))
      .limit(200)
    return NextResponse.json({ items: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
