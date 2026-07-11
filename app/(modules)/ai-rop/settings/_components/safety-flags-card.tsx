"use client"

// Безопасная запись — dry-run переключатели для CRM/сообщений. Дефолт (новая
// компания) — ОБА включены (см. rop_settings.dryRunCrm/dryRunMessages default
// true, план п.5). Бейдж явно показывает текущий режим.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

export function SafetyFlagsCard({ initialDryRunCrm, initialDryRunMessages }: { initialDryRunCrm: boolean; initialDryRunMessages: boolean }) {
  const [dryRunCrm, setDryRunCrm] = useState(initialDryRunCrm)
  const [dryRunMessages, setDryRunMessages] = useState(initialDryRunMessages)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function toggle(field: "dryRunCrm" | "dryRunMessages", value: boolean) {
    setBusy(true)
    if (field === "dryRunCrm") setDryRunCrm(value); else setDryRunMessages(value)
    try {
      await fetch("/api/modules/ai-rop/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: value, kind: field === "dryRunCrm" ? "crm" : "messages" }),
      })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-violet-600" /> Безопасная запись</CardTitle>
        <CardDescription>Тестовый режим — при включённом dry-run в CRM и мессенджеры ничего не пишем, только показываем что было бы отправлено.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">DRY_RUN — запись в CRM</div>
            <div className="text-xs text-muted-foreground">Комментарии/резюме в Timeline Bitrix не отправляются, только логируются.</div>
          </div>
          <div className="flex items-center gap-2">
            {dryRunCrm && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">тест</Badge>}
            <Switch checked={dryRunCrm} onCheckedChange={(v) => toggle("dryRunCrm", v)} disabled={busy} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">DRY_RUN — сообщения / IM-отчёты</div>
            <div className="text-xs text-muted-foreground">Расписания отчётов в Bitrix IM не отправляются реальным получателям.</div>
          </div>
          <div className="flex items-center gap-2">
            {dryRunMessages && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">тест</Badge>}
            <Switch checked={dryRunMessages} onCheckedChange={(v) => toggle("dryRunMessages", v)} disabled={busy} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
