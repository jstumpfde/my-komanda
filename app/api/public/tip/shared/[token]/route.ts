// GET /api/public/tip/shared/[token] — публичный просмотр готового разбора по
// share-токену (без владения/cookie). Отдаёт только status='done'.

import { NextRequest, NextResponse } from "next/server"
import { getRunByShareToken } from "@/lib/tip/service"
import { getTipContext } from "@/lib/tip/contexts"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const run = await getRunByShareToken(token)

  if (!run || run.status !== "done") {
    return NextResponse.json({ error: "Разбор не найден" }, { status: 404 })
  }

  const contextSlug = run.inputJson?.contexts?.[0]
  const context = contextSlug ? getTipContext(contextSlug) : undefined

  return NextResponse.json({
    resultMd: run.resultMd,
    formula: run.formulaJson,
    context: context ? { slug: context.slug, title: context.title } : contextSlug,
    name: run.inputJson?.name,
    createdAt: run.createdAt,
  })
}
