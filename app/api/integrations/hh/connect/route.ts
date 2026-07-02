import { NextRequest, NextResponse } from "next/server"
import { requireDirector } from "@/lib/api-helpers"
import { getAuthUrl } from "@/lib/hh-api"
import { encodeHhState } from "@/lib/hh/oauth-state"

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

  // Подписываем state (HMAC-SHA256 через NEXTAUTH_SECRET). Callback доверяет
  // companyId из state ТОЛЬКО после проверки подписи — иначе можно было бы
  // подставить чужой companyId и привязать hh-интеграцию к чужой компании.
  const state = encodeHhState({
    companyId: user.companyId,
    userId: user.id,
    ...(vacancyId ? { vacancyId } : {}),
    issuedAt: Date.now(),
  })

  const url = getAuthUrl(state)
  return NextResponse.redirect(url)
}
