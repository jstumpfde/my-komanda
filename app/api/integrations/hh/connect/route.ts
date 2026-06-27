import { NextRequest, NextResponse } from "next/server"
import { requireDirector } from "@/lib/api-helpers"
import { getAuthUrl } from "@/lib/hh-api"

export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireDirector>>
  try {
    user = await requireDirector()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Если подключаются СО страницы конкретной вакансии — запоминаем её id,
  // чтобы callback вернул туда и сразу открыл «Привязать» (один поток вместо двух).
  const vacancyId = req.nextUrl.searchParams.get("vacancyId") || undefined

  const state = Buffer.from(JSON.stringify({
    companyId: user.companyId,
    userId: user.id,
    ...(vacancyId ? { vacancyId } : {}),
  })).toString("base64url")

  const url = getAuthUrl(state)
  return NextResponse.redirect(url)
}
