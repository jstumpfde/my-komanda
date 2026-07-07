// GET /api/public/tip/run/[id] — статус/результат прогона. Доступ только
// владельцу (идентификация по cookie tip_uid, см. lib/tip/session.ts).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { getRunForUser } from "@/lib/tip/service"
import { getTipContext } from "@/lib/tip/contexts"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await getOrCreateTipUser()

  const run = await getRunForUser(user.id, id)
  if (!run) {
    return NextResponse.json({ error: "Разбор не найден" }, { status: 404 })
  }

  const contextSlug = run.inputJson?.contexts?.[0]
  const context = contextSlug ? getTipContext(contextSlug) : undefined

  return NextResponse.json({
    id: run.id,
    status: run.status,
    resultMd: run.resultMd,
    formula: run.formulaJson,
    // shareToken отдаём только для завершённых прогонов — иначе клиент мог бы
    // получить ссылку на страницу разбора до готовности результата (токен
    // генерируется сразу при создании прогона, см. lib/tip/service.ts).
    shareToken: run.status === "done" ? run.shareToken : null,
    error: run.errorText,
    context: context ? { slug: context.slug, title: context.title } : contextSlug,
    createdAt: run.createdAt,
  })
}
