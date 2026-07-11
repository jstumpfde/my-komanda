"use client"

// Баннер деградации AI-провайдера на дашборде AI-РОП — читает
// lib/ai-rop/provider-health.ts::getProviderHealth() server-side (page.tsx),
// показывается ТОЛЬКО пока статус != "ok". Кнопка «Проверить провайдера»
// (только canManage — probe делает реальный запрос к провайдеру) дёргает
// GET /api/modules/ai-rop/provider-health/check и при восстановлении
// перезагружает страницу (баннер сам исчезнет).
import { useState } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"
import type { RopProviderHealthStatus } from "@/lib/ai-rop/types"

const STATUS_LABEL: Record<RopProviderHealthStatus["status"], string> = {
  ok: "провайдер доступен",
  quota: "квота/биллинг исчерпаны",
  auth: "ключ недействителен (auth)",
  network: "провайдер недоступен (сеть)",
}

export function ProviderHealthBanner({ health, canManage }: { health: RopProviderHealthStatus; canManage: boolean }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (health.status === "ok") return null

  async function check() {
    setBusy(true); setNote(null)
    try {
      const r = await fetch("/api/modules/ai-rop/provider-health/check")
      const data = await r.json().catch(() => ({}))
      if (data?.ok && data.health?.status === "ok") {
        window.location.reload()
        return
      }
      setNote(data?.health?.message || "Провайдер всё ещё недоступен")
    } catch {
      setNote("Не удалось проверить — попробуйте позже")
    } finally { setBusy(false) }
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">
        <div>
          <b>Разбор звонков AI-РОП остановлен.</b> Провайдер «{health.provider}»: {STATUS_LABEL[health.status]}.
        </div>
        {health.message && <div className="mt-0.5 text-xs opacity-80">{health.message}</div>}
        <div className="mt-0.5 text-xs opacity-80">Звонки копятся в очереди — пополните баланс / проверьте ключ. Как заработает — обработка возобновится сама.</div>
        {canManage && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={check}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-background px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-500/10 disabled:opacity-60 dark:text-red-400"
            >
              <RotateCw className="size-3" /> {busy ? "Проверяю…" : "Проверить провайдера"}
            </button>
            {note && <span className="text-xs opacity-80">{note}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
