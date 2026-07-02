"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

// Тумблер AI чат-бота на вкладке «Портрет» — для легаси-вакансий (не на Воронке
// v2), чтобы там тоже можно было включить чат-бота. Взаимоисключение с движком
// Воронки v2 (решение Юрия 02.07): включение чат-бота выключает v2 (enforced на
// сервере в /ai-chatbot PUT). Когда v2-движок включён — тумблер здесь заблокирован
// с пояснением, чат-бот управляется в конструкторе Воронки v2.
export function PortraitChatbotToggle({
  vacancyId, enabled, v2Enabled, onChanged,
}: {
  vacancyId: string
  enabled: boolean
  v2Enabled: boolean
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)

  const toggle = async (val: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: val }),
      })
      if (!res.ok) throw new Error()
      toast.success(val ? "AI чат-бот включён" : "AI чат-бот выключен")
      onChanged?.()
    } catch {
      toast.error("Не удалось переключить чат-бот")
    } finally { setBusy(false) }
  }

  return (
    <div className={cn("rounded-xl border p-3 flex items-start gap-3", enabled ? "border-violet-300/60 bg-violet-500/5" : "border-border bg-muted/30")}>
      <Switch checked={enabled} onCheckedChange={toggle} disabled={busy || v2Enabled} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">🤖 AI чат-бот</span>
          {busy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          {enabled
            ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-400">включён</span>
            : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">выключен</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {v2Enabled
            ? "Включён движок Воронки v2 — чат-бот управляется в конструкторе Воронки v2. Чат-бот и Воронка v2 работают по отдельности (либо/либо)."
            : "Отвечает кандидатам на всех этапах вместо скриптовых дожимов. Чат-бот и Воронка v2 — либо/либо: включение чат-бота выключит движок Воронки v2. Промпт, фильтры и песочница — в разделе «AI чат-бот»."}
        </p>
      </div>
    </div>
  )
}
