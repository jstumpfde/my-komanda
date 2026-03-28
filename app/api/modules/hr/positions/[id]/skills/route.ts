import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { positionSkills, skills } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: positionId } = await params

  const rows = await db
    .select({
      id: positionSkills.id,
      positionId: positionSkills.positionId,
      requiredLevel: positionSkills.requiredLevel,
      skillId: skills.id,
      skillName: skills.name,
      skillCategory: skills.category,
    })
    .from(positionSkills)
    .innerJoin(skills, eq(positionSkills.skillId, skills.id))
    .where(eq(positionSkills.positionId, positionId))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: positionId } = await params
  const body = await req.json()
  // body.skills: { skillId: string, requiredLevel: number }[]

  // Replace all requirements for this position
  await db.delete(positionSkills).where(eq(positionSkills.positionId, positionId))

  if (body.skills?.length) {
    await db.insert(positionSkills).values(
      (body.skills as { skillId: string; requiredLevel: number }[]).map(s => ({
        positionId,
        skillId: s.skillId,
        requiredLevel: s.requiredLevel || 3,
      }))
    )
  }

  const rows = await db
    .select({
      id: positionSkills.id,
      requiredLevel: positionSkills.requiredLevel,
      skillId: skills.id,
      skillName: skills.name,
      skillCategory: skills.category,
    })
    .from(positionSkills)
    .innerJoin(skills, eq(positionSkills.skillId, skills.id))
    .where(eq(positionSkills.positionId, positionId))

  return NextResponse.json(rows)
}
