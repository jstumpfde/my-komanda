// POST /api/modules/knowledge/sources/[id]/folders — сохранить выбор папок
// источника (директор): путь, аудитория (фаза 1 — только хранится, серверный
// enforcement аудиторий вне aiOptOut — фаза 2, см. концепт §phases) и галочка
// «не использовать в AI» (aiOptOut — enforced сразу в retrieval.ts).

import { NextRequest } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { apiError, apiSuccess, requireDirector } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { knowledgeSources, knowledgeSourceDocuments, type KnowledgeSourceRootFolder } from "@/lib/db/schema"
import { assertKnowledgeDriveSourcesEnabled } from "@/lib/knowledge-sources/feature-flag"
import { resolveAiOptOut } from "@/lib/knowledge-sources/root-folders"

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
    await assertKnowledgeDriveSourcesEnabled(user) // MAJOR-1: гейт на каждом роуте
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

    // tenantId в WHERE — defense-in-depth (MINOR-c из ревью): выборка выше уже
    // проверила владение, но UPDATE не должен полагаться на неё одну.
    await db.update(knowledgeSources)
      .set({ rootFolders: folders, updatedAt: new Date() })
      .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.tenantId, user.companyId)))

    // MAJOR-2 (ревью 11.07): aiOptOut применяется МГНОВЕННО, не при следующем
    // краулe. Retrieval фильтрует по денормализованному
    // knowledge_source_documents.ai_opt_out — пересчитываем его для всех
    // документов источника прямо здесь, по свежесохранённым папкам.
    const docs = await db
      .select({
        id: knowledgeSourceDocuments.id,
        externalPath: knowledgeSourceDocuments.externalPath,
        aiOptOut: knowledgeSourceDocuments.aiOptOut,
      })
      .from(knowledgeSourceDocuments)
      .where(and(
        eq(knowledgeSourceDocuments.sourceId, id),
        eq(knowledgeSourceDocuments.tenantId, user.companyId),
      ))

    const toOptOut: string[] = []
    const toOptIn: string[] = []
    for (const doc of docs) {
      const next = resolveAiOptOut(folders, doc.externalPath)
      if (next && !doc.aiOptOut) toOptOut.push(doc.id)
      else if (!next && doc.aiOptOut) toOptIn.push(doc.id)
    }
    const now = new Date()
    if (toOptOut.length > 0) {
      await db.update(knowledgeSourceDocuments)
        .set({ aiOptOut: true, updatedAt: now })
        .where(and(
          inArray(knowledgeSourceDocuments.id, toOptOut),
          eq(knowledgeSourceDocuments.tenantId, user.companyId),
        ))
    }
    if (toOptIn.length > 0) {
      await db.update(knowledgeSourceDocuments)
        .set({ aiOptOut: false, updatedAt: now })
        .where(and(
          inArray(knowledgeSourceDocuments.id, toOptIn),
          eq(knowledgeSourceDocuments.tenantId, user.companyId),
        ))
    }

    return apiSuccess({ ok: true, folders, aiOptOutUpdated: toOptOut.length + toOptIn.length })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/sources/[id]/folders]", err)
    return apiError("Internal server error", 500)
  }
}
