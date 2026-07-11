"use client"

// Параметры дашборда — порог «разговор состоялся» (contactThresholdSeconds,
// используется в lib/ai-rop/dashboard-data.ts для колонок «Контактов»/
// «Пропущ.»), срок хранения аудиозаписей (recordingsRetentionDays, читает
// cron ai-rop-process::runTtlCleanup — удаляет ТОЛЬКО файл, история звонков
// остаётся навсегда) и цель недельного челленджа (weeklyDoneGoal, лидерборд/
// геймификация, lib/ai-rop/gamification.ts).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { SlidersHorizontal } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface DashboardSettingsInitial {
  contactThresholdSeconds: number
  recordingsRetentionDays: number
  weeklyDoneGoal: number
}

export function DashboardSettingsCard({ initial }: { initial: DashboardSettingsInitial }) {
  const [contactThreshold, setContactThreshold] = useState(String(initial.contactThresholdSeconds))
  const [retentionDays, setRetentionDays] = useState(String(initial.recordingsRetentionDays))
  const [weeklyGoal, setWeeklyGoal] = useState(String(initial.weeklyDoneGoal))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const ct = Number(contactThreshold)
      const rd = Number(retentionDays)
      const wg = Number(weeklyGoal)
      await fetch("/api/modules/ai-rop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactThresholdSeconds: Number.isFinite(ct) && ct > 0 ? Math.trunc(ct) : undefined,
          recordingsRetentionDays: Number.isFinite(rd) && rd > 0 ? Math.trunc(rd) : undefined,
          weeklyDoneGoal: Number.isFinite(wg) && wg > 0 ? Math.trunc(wg) : undefined,
        }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><SlidersHorizontal className="size-4 text-violet-600" /> Параметры дашборда</CardTitle>
        <CardDescription>Пороги подсчёта на дашборде, срок хранения аудиозаписей и цель недельного челленджа.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Порог «разговор состоялся», сек</Label>
            <Input type="number" min={5} value={contactThreshold} onChange={(e) => setContactThreshold(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Хранение аудио, дней</Label>
            <Input type="number" min={1} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Цель недельного челленджа, звонков</Label>
            <Input type="number" min={1} value={weeklyGoal} onChange={(e) => setWeeklyGoal(e.target.value)} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">История звонков и аналитика хранятся всегда — «Хранение аудио» удаляет только сами файлы записей для экономии диска, транскрипты и разбор остаются.</div>
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
