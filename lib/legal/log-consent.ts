import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { consentLog } from "@/lib/db/schema"

// Серверная запись в журнал согласий 152-ФЗ (см. consentLog в lib/db/schema.ts,
// читает /admin/platform → «Согласия» через /api/platform/consent-log).
//
// До этого файла формы (регистрация /register, партнёрская заявка
// /register/partner, портфолио /portfolio) писали согласие ТОЛЬКО отдельным
// best-effort fetch с клиента на POST /api/consent — второй сетевой запрос
// после успешной отправки формы, ошибка которого проглатывается
// (`.catch(() => {})`) и никак не влияет на UX. При сбое сети/расширении-
// блокировщике/закрытой раньше времени вкладке этот второй запрос молча
// терялся — и счётчик согласий в админке оставался на нуле, хотя сами
// заявки/регистрации прекрасно доходили. Теперь событие пишется здесь же,
// на сервере, синхронно с основной записью (заявка/лид) — без зависимости
// от второго клиентского запроса.
export async function insertConsentLog(params: {
  req: NextRequest
  userId?: string | null
  visitorId?: string | null
  consentType: "cookie" | "privacy_policy" | "marketing"
  action?: "accepted" | "rejected" | "partial"
  documentVersion: string
  details?: Record<string, unknown> | null
}): Promise<void> {
  const {
    req,
    userId = null,
    visitorId = null,
    consentType,
    action = "accepted",
    documentVersion,
    details = null,
  } = params

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  const userAgent = req.headers.get("user-agent") || null

  await db.insert(consentLog).values({
    userId,
    visitorId: visitorId ? visitorId.slice(0, 200) : null,
    consentType,
    action,
    documentVersion: documentVersion.slice(0, 50),
    details,
    ipAddress,
    userAgent,
  })
}

// Обёртка для точек регистрации/лидогенерации с двумя чекбоксами (согласие
// на обработку ПД — обязательное, согласие на рассылку — опциональное).
// privacy_policy логируется ВСЕГДА (вызывающая форма обязана сама гарантировать,
// что до вызова дошли только сабмиты с отмеченным обязательным чекбоксом —
// как и раньше, кнопка отправки в этих формах задизейблена без него).
// Ошибки проглатываются: запись в журнал согласий — best-effort и не должна
// ронять успешный ответ формы регистрации/заявки.
export async function logRegistrationConsent(params: {
  req: NextRequest
  visitorId: string
  privacyPolicyVersion: string
  marketingConsent?: boolean
  marketingConsentVersion?: string
}): Promise<void> {
  const { req, visitorId, privacyPolicyVersion, marketingConsent, marketingConsentVersion } = params
  try {
    await insertConsentLog({
      req,
      visitorId,
      consentType: "privacy_policy",
      documentVersion: privacyPolicyVersion,
    })
    if (marketingConsent && marketingConsentVersion) {
      await insertConsentLog({
        req,
        visitorId,
        consentType: "marketing",
        documentVersion: marketingConsentVersion,
      })
    }
  } catch (err) {
    console.error("[consent-log] registration consent write failed:", err instanceof Error ? err.message : err)
  }
}
