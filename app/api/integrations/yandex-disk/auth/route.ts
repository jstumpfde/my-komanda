// Старт OAuth Яндекс.Диска для источника знаний (по образцу
// app/api/integrations/yandex-direct/auth, но state подписан — см.
// lib/knowledge-sources/oauth-state.ts). Только директор компании — раздел
// «Источники» сам по себе гейтится фиче-флагом на уровне UI/чтения, но
// подключение — необратимое административное действие.

import { NextResponse } from "next/server"
import { requireDirector } from "@/lib/api-helpers"
import { buildAuthUrl, isYandexDiskConfigured } from "@/lib/knowledge-sources/yandex-oauth"
import { encodeKnowledgeSourceState } from "@/lib/knowledge-sources/oauth-state"
import { isTokenCryptoConfigured } from "@/lib/knowledge-sources/token-crypto"

export async function GET() {
  let user
  try {
    user = await requireDirector()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!isYandexDiskConfigured()) {
    return NextResponse.json({ error: "Яндекс.Диск не настроен на сервере (нет YANDEX_DISK_CLIENT_ID/SECRET)" }, { status: 500 })
  }
  if (!isTokenCryptoConfigured()) {
    return NextResponse.json({ error: "Шифрование токенов не настроено на сервере (нет INTEGRATION_TOKEN_KEY)" }, { status: 500 })
  }

  const state = encodeKnowledgeSourceState({
    companyId: user.companyId,
    userId: user.id,
    provider: "yandex_disk",
  })
  return NextResponse.redirect(buildAuthUrl(state))
}
