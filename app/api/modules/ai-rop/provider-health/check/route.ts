// GET /api/modules/ai-rop/provider-health/check — ручная проверка здоровья
// AI/STT-провайдера (кнопка «Проверить провайдера» в баннере деградации на
// дашборде AI-РОП, см. lib/ai-rop/provider-health.ts). Дешёвый probe-запрос к
// OpenAI (probeOpenAiHealth) — при успехе снимает деградацию и шлёт алерт
// «возобновлён» (clearProviderHealthIfDegraded), при неудаче обновляет статус
// (setProviderHealth), который дальше блокирует/не блокирует обработку
// звонков в lib/ai-rop/transcribe.ts.
//
// Доступ: requireRopManage (директор) — реальный запрос к внешнему провайдеру,
// рядовому менеджеру дёргать его незачем. Статус провайдера ПЛАТФОРМЕННЫЙ (не
// per-company, см. provider-health.ts докблок), поэтому companyId здесь не
// участвует — проверка одна на всю инсталляцию.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { probeOpenAiHealth, setProviderHealth, clearProviderHealthIfDegraded, getProviderHealth } from "@/lib/ai-rop/provider-health"

export async function GET() {
  try {
    await requireRopManage()

    const probe = await probeOpenAiHealth()
    if (probe.ok) {
      await clearProviderHealthIfDegraded()
    } else {
      await setProviderHealth({
        status: probe.kind,
        provider: "openai",
        message: probe.message || "Провайдер недоступен",
        detectedAt: new Date().toISOString(),
      })
    }

    const health = (await getProviderHealth()) ?? {
      status: probe.ok ? ("ok" as const) : probe.kind,
      provider: "openai",
      message: probe.message || "",
      detectedAt: new Date().toISOString(),
    }

    return NextResponse.json({ ok: true, health })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/provider-health/check] error:", err)
    return apiError("Internal server error", 500)
  }
}
