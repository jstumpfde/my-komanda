// POST /api/modules/knowledge/sources/[id]/folders — сохранить выбор папок
// источника (директор): путь, аудитория (фаза 1 — только хранится, серверный
// enforcement аудиторий вне aiOptOut — фаза 2, см. концепт §phases) и галочка
// «не использовать в AI» (aiOptOut — enforced сразу в retrieval.ts).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources, type KnowledgeSourceRootFolder } from "@/lib/db/schema"

const VALID_AUDIENCES = new Set(["employees", "department", "clients", "partners", "owner_only"])

function validateFolders(input: unknown): KnowledgeSourceRootFolder[] | null {
  if (!Array.isArray(input)) return null
  const out: KnowledgeSourceRootFolder[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null
    const f = raw as Record<string, unknown>
    if (typeof f.path !== "string" || !f.path.trim()) return null
    const audience = typeof f.audience === "string" && VALID_AUDIENCES.has(f.audience) ? f.audience : "employees"
    out.push({
      path: f.path,
      label: typeof f.label === "string" ? f.label : undefined,
      audience: audience as KnowledgeSourceRootFolder["audience"],
      aiOptOut: f.aiOptOut === true,
    })
  }
  return out
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireDirector()
    const { id } = await params

    const body = await req.json().catch(() => null) as { folders?: unknown } | null
    const folders = validateFolders(body?.folders)
    if (!folders) return apiError("Некорректный список папок", 400)

    const [source] = await db
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.tenantId, user.companyId)))
      .limit(1)
    if (!source) return apiError("Источник не найден", 404)

    await db.update(knowledgeSources)
      .set({ rootFolders: folders, updatedAt: new Date() })
      .where(eq(knowledgeSources.id, id))

    return apiSuccess({ ok: true, folders })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources/[id]/folders]", err)
    return apiError("Internal server error", 500)
  }
}
