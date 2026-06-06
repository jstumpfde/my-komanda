"use client"

// Дожим по ТЕСТУ — отдельный самодостаточный блок на странице «Дожим»,
// по образцу демо-дожима (VacancyFollowupSettings), но для теста.
// Две ветки: «не открыл тест» и «открыл, но не заполнил».
// Конфиг хранится в follow_up_campaigns (test_enabled/test_preset/
// test_messages/test_messages_opened), сохраняется тем же PATCH-эндпоинтом.
// По умолчанию выключен — пока HR не включит, ничего не шлётся.
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Loader2, ClipboardList, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FOLLOWUP_PRESETS, FOLLOWUP_MESSAGE_SLOTS, type FollowUpPreset } from "@/lib/followup/presets"
import {
  DEFAULT_TEST_NOT_OPENED,
  DEFAULT_TEST_OPENED_NOT_SUBMITTED,
} from "@/lib/followup/default-messages"

const PRESET_ORDER: FollowUpPreset[] = ["off", "soft", "standard", "aggressive"]
const MAX_MSG_LEN = 2000

function buildSlotValues(custom: string[] | null, defaults: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < FOLLOWUP_MESSAGE_SLOTS; i++) {
    const v = custom?.[i]
    out.push(typeof v === "string" && v.length > 0 ? v : (defaults[i] ?? ""))
  }
  return out
}
function slotsUsage(preset: FollowUpPreset): Map<number, number[]> {
  const map = new Map<number, number[]>()
  const cfg = FOLLOWUP_PRESETS[preset]
  cfg.messageIndexes.forEach((slot, idx) => {
    const day = cfg.days[idx]
    if (day === undefined) return
    const prev = map.get(slot) ?? []
    prev.push(day)
    map.set(slot, prev)
  })
  return map
}

interface Campaign {
  testEnabled?: boolean
  testPreset?: string
  testMessages?: string[] | null
  testMessagesOpened?: string[] | null
}

export function VacancyTestFollowupSettings({ vacancyId }: { vacancyId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState<FollowUpPreset>("off")
  const [customA, setCustomA] = useState<string[] | null>(null)
  const [customB, setCustomB] = useState<string[] | null>(null)
  const [touchedA, setTouchedA] = useState(false)
  const [touchedB, setTouchedB] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`)
      .then((r) => r.json() as Promise<{ campaign?: Campaign | null }>)
      .then((data) => {
        if (cancelled || !data.campaign) return
        setEnabled(!!data.campaign.testEnabled)
        const p = data.campaign.testPreset
        setPreset((PRESET_ORDER.includes(p as FollowUpPreset) ? p : "off") as FollowUpPreset)
        setCustomA(data.campaign.testMessages ?? null)
        setCustomB(data.campaign.testMessagesOpened ?? null)
      })
      .catch((e) => console.error("[test-followup] load failed:", e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  const markDirty = () => setDirty(true)
  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { testEnabled: enabled, testPreset: preset }
      if (touchedA) body.testMessages = customA
      if (touchedB) body.testMessagesOpened = customB
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { campaign?: Campaign; error?: string }
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить")
      toast.success("Дожим по тесту сохранён")
      setTouchedA(false); setTouchedB(false); setDirty(false)
      if (data.campaign) {
        setCustomA(data.campaign.testMessages ?? null)
        setCustomB(data.campaign.testMessagesOpened ?? null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const presetCfg = FOLLOWUP_PRESETS[preset]
  const usage = slotsUsage(preset)
  const valuesA = buildSlotValues(customA, DEFAULT_TEST_NOT_OPENED)
  const valuesB = buildSlotValues(customB, DEFAULT_TEST_OPENED_NOT_SUBMITTED)
  const updateA = (slot: number, value: string) => { setTouchedA(true); markDirty(); const next = customA ? [...customA] : [...valuesA]; next[slot] = value; setCustomA(next) }
  const updateB = (slot: number, value: string) => { setTouchedB(true); markDirty(); const next = customB ? [...customB] : [...valuesB]; next[slot] = value; setCustomB(next) }

  const renderBranch = (
    title: string, sub: string, values: string[], custom: string[] | null,
    update: (slot: number, v: string) => void, reset: () => void, touched: boolean,
  ) => (
    <AccordionContent className="space-y-3 pt-1">
      <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 border">
        Плейсхолдеры:{" "}
        <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{name}}"}</code>,{" "}
        <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{vacancy}}"}</code>,{" "}
        <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{test_link}}"}</code>.
      </p>
      {values.map((value, slot) => {
        const usedDays = usage.get(slot) ?? []
        const isUsed = usedDays.length > 0
        const overLimit = value.length > MAX_MSG_LEN
        return (
          <div key={slot} className={cn("space-y-1", !isUsed && "opacity-60")}>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium">Шаблон {slot + 1}</Label>
              {isUsed
                ? <Badge variant="secondary" className="h-5 text-[10px] font-normal">Отправляется {usedDays.map((d) => `Д+${d}`).join(", ")}</Badge>
                : <Badge variant="outline" className="h-5 text-[10px] font-normal text-muted-foreground">Не используется в пресете «{presetCfg.label}»</Badge>}
            </div>
            <Textarea value={value} onChange={(e) => update(slot, e.target.value)} rows={2} className="text-sm resize-y" disabled={loading || !enabled} />
            <div className={cn("text-[10px] text-right tabular-nums", overLimit ? "text-destructive font-medium" : "text-muted-foreground")}>{value.length} / {MAX_MSG_LEN}</div>
          </div>
        )
      })}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={reset} disabled={loading || (!custom && !touched)} className="gap-1.5 text-xs">
          <RotateCcw className="w-3 h-3" /> Вернуть к стандарту
        </Button>
      </div>
    </AccordionContent>
  )

  return (
    <Card className="mt-5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Дожим по тесту
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Напоминания через hh тем, кому отправлен тест: кто не открыл и кто открыл, но не заполнил.
              Гасится автоматически, когда кандидат сдаёт тест.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); markDirty() }} disabled={loading} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_ORDER.map((p) => (
              <button key={p} type="button" onClick={() => { setPreset(p); markDirty() }} disabled={loading || !enabled}
                className={cn("rounded-md border px-3 py-2 text-sm font-medium transition-colors text-center",
                  preset === p ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                  (!enabled || loading) && "opacity-60 cursor-not-allowed")}>
                {FOLLOWUP_PRESETS[p].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{FOLLOWUP_PRESETS[preset].description}</p>
          {presetCfg.days.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Дни касаний (Д = день отправки теста): {presetCfg.days.map((d) => `Д+${d}`).join(", ")}
            </p>
          )}
        </div>

        <Accordion type="multiple" className="rounded-md border">
          <AccordionItem value="t-a" className="px-3">
            <AccordionTrigger className="text-sm">
              <div className="flex-1 text-left">
                <div className="font-medium">Тексты для тех, кто не открыл тест</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-normal">Ветка А · 9 шаблонов · {customA ? "кастом" : "стандарт"}</div>
              </div>
            </AccordionTrigger>
            {renderBranch("a", "не открыл", valuesA, customA, updateA, () => { setTouchedA(true); markDirty(); setCustomA(null) }, touchedA)}
          </AccordionItem>
          <AccordionItem value="t-b" className="px-3 border-t">
            <AccordionTrigger className="text-sm">
              <div className="flex-1 text-left">
                <div className="font-medium">Тексты для тех, кто открыл, но не заполнил</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-normal">Ветка Б · 9 шаблонов · {customB ? "кастом" : "стандарт"}</div>
              </div>
            </AccordionTrigger>
            {renderBranch("b", "открыл не заполнил", valuesB, customB, updateB, () => { setTouchedB(true); markDirty(); setCustomB(null) }, touchedB)}
          </AccordionItem>
        </Accordion>

        <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 border">
          Работает независимо от «Напоминаний о тесте» в табе «Тест». Если включены оба — кандидат может получить
          оба набора сообщений; оставьте что-то одно, чтобы не дублировать.
        </p>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <div className="text-xs">
            {dirty ? (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Есть несохранённые изменения</Badge>
            ) : (
              <span className="text-muted-foreground">Изменений нет</span>
            )}
          </div>
          <Button size="sm" onClick={() => { void handleSave() }} disabled={loading || saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
