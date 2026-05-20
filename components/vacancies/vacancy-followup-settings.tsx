"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Loader2, Save, MessageSquareText, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FOLLOWUP_PRESETS, FOLLOWUP_MESSAGE_SLOTS, type FollowUpPreset } from "@/lib/followup/presets"
import {
  DEFAULT_FOLLOWUP_NOT_OPENED,
  DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED,
} from "@/lib/followup/default-messages"

interface Campaign {
  id: string
  vacancyId: string
  preset: string
  enabled: boolean
  stopOnReply: boolean
  stopOnVacancyClosed: boolean
  customMessages: string[] | null
  customMessagesOpened: string[] | null
}

interface Props {
  vacancyId: string
}

const PRESET_ORDER: FollowUpPreset[] = ["off", "soft", "standard", "aggressive"]
const MAX_MSG_LEN = 2000

// Возвращает массив длиной FOLLOWUP_MESSAGE_SLOTS, в котором пустые
// слоты заменены дефолтами. Используется и для отображения textarea,
// и для подсчёта «кастом vs стандарт» при сохранении.
function buildSlotValues(custom: string[] | null, defaults: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < FOLLOWUP_MESSAGE_SLOTS; i++) {
    const v = custom?.[i]
    out.push(typeof v === "string" && v.length > 0 ? v : (defaults[i] ?? ""))
  }
  return out
}

// Для каждого слота 0..8 определяет, в какие дни текущего пресета он
// уходит. Возвращает массив [{ slot, days: [1,7] }, ...].
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

export function VacancyFollowupSettings({ vacancyId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState<FollowUpPreset>("off")
  const [stopOnReply, setStopOnReply] = useState(true)
  const [stopOnVacancyClosed, setStopOnVacancyClosed] = useState(true)

  // Кастомные тексты: null = «используем дефолты», array = «юзер настроил».
  // При onChange textarea state становится array; «Вернуть к стандарту»
  // сбрасывает в null и явно отправляет null в PATCH.
  const [customA, setCustomA] = useState<string[] | null>(null)
  const [customB, setCustomB] = useState<string[] | null>(null)
  // touchedA/touchedB — флаги «юзер взаимодействовал с этим набором
  // в текущей сессии». Защищает от случайной перезаписи если юзер
  // не открывал Accordion перед нажатием «Сохранить».
  const [touchedA, setTouchedA] = useState(false)
  const [touchedB, setTouchedB] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`)
        const data = await res.json() as { campaign?: Campaign | null }
        if (cancelled) return
        if (data.campaign) {
          setEnabled(data.campaign.enabled)
          const p = data.campaign.preset
          setPreset((PRESET_ORDER.includes(p as FollowUpPreset) ? p : "off") as FollowUpPreset)
          setStopOnReply(data.campaign.stopOnReply)
          setStopOnVacancyClosed(data.campaign.stopOnVacancyClosed)
          setCustomA(data.campaign.customMessages ?? null)
          setCustomB(data.campaign.customMessagesOpened ?? null)
        }
      } catch (err) {
        console.error("[followup-settings] load failed:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [vacancyId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { enabled, preset, stopOnReply, stopOnVacancyClosed }
      if (touchedA) body.customMessages = customA
      if (touchedB) body.customMessagesOpened = customB
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { campaign?: Campaign; error?: string }
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить")
      toast.success("Настройки воронки дожима сохранены")
      setTouchedA(false)
      setTouchedB(false)
      if (data.campaign) {
        setCustomA(data.campaign.customMessages ?? null)
        setCustomB(data.campaign.customMessagesOpened ?? null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const presetCfg = FOLLOWUP_PRESETS[preset]
  const usage = slotsUsage(preset)
  const valuesA = buildSlotValues(customA, DEFAULT_FOLLOWUP_NOT_OPENED)
  const valuesB = buildSlotValues(customB, DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED)

  const updateValueA = (slot: number, value: string) => {
    setTouchedA(true)
    const next = customA ? [...customA] : [...valuesA]
    next[slot] = value
    setCustomA(next)
  }
  const updateValueB = (slot: number, value: string) => {
    setTouchedB(true)
    const next = customB ? [...customB] : [...valuesB]
    next[slot] = value
    setCustomB(next)
  }
  const resetA = () => { setTouchedA(true); setCustomA(null) }
  const resetB = () => { setTouchedB(true); setCustomB(null) }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquareText className="w-4 h-4" />
              Цепочка дожима
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Автоматические напоминания через hh кандидатам, которые не открыли демо или не допрошли его.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_ORDER.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                disabled={loading || !enabled}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors text-center",
                  preset === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                  (!enabled || loading) && "opacity-60 cursor-not-allowed",
                )}
              >
                {FOLLOWUP_PRESETS[p].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {FOLLOWUP_PRESETS[preset].description}
          </p>
        </div>

        {presetCfg.days.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Расписание касаний (отсчёт у каждого кандидата идёт от его даты приглашения):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presetCfg.days.map((dayOffset, idx) => (
                <div
                  key={idx}
                  className="rounded-md border bg-background px-2 py-1 text-xs font-medium tabular-nums"
                >
                  Д+{dayOffset}
                </div>
              ))}
            </div>
          </div>
        )}

        <Accordion type="multiple" className="rounded-md border">
          <AccordionItem value="branch-a" className="px-3">
            <AccordionTrigger className="text-sm">
              <div className="flex-1 text-left">
                <div className="font-medium">Тексты для тех, кто не открыл демо</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-normal">
                  Ветка А · 9 шаблонов · {customA ? "кастом" : "стандарт"}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-1">
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 border">
                Плейсхолдеры:{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{Имя}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{должность}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{ссылка}"}</code>.
                <br />
                Светлым отмечены шаблоны, которые в текущем пресете не отправляются — но вы можете их подготовить заранее на случай смены пресета.
              </p>
              {valuesA.map((value, slot) => {
                const usedDays = usage.get(slot) ?? []
                const isUsed = usedDays.length > 0
                const overLimit = value.length > MAX_MSG_LEN
                return (
                  <div key={slot} className={cn("space-y-1", !isUsed && "opacity-60")}>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium">
                        Шаблон {slot + 1}
                      </Label>
                      {isUsed
                        ? <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                            Отправляется {usedDays.map(d => `Д+${d}`).join(", ")}
                          </Badge>
                        : <Badge variant="outline" className="h-5 text-[10px] font-normal text-muted-foreground">
                            Не используется в пресете «{presetCfg.label}»
                          </Badge>}
                    </div>
                    <Textarea
                      value={value}
                      onChange={e => updateValueA(slot, e.target.value)}
                      rows={2}
                      className="text-sm resize-y"
                      disabled={loading || !enabled}
                    />
                    <div className={cn(
                      "text-[10px] text-right tabular-nums",
                      overLimit ? "text-destructive font-medium" : "text-muted-foreground",
                    )}>
                      {value.length} / {MAX_MSG_LEN}
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetA}
                  disabled={loading || (!customA && !touchedA)}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  Вернуть к стандарту
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="branch-b" className="px-3 border-t">
            <AccordionTrigger className="text-sm">
              <div className="flex-1 text-left">
                <div className="font-medium">Тексты для тех, кто начал, но не дошёл до конца</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-normal">
                  Ветка Б · 9 шаблонов · {customB ? "кастом" : "стандарт"}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-1">
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 border">
                Плейсхолдеры:{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{Имя}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{должность}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{ссылка}"}</code>.
              </p>
              {valuesB.map((value, slot) => {
                const usedDays = usage.get(slot) ?? []
                const isUsed = usedDays.length > 0
                const overLimit = value.length > MAX_MSG_LEN
                return (
                  <div key={slot} className={cn("space-y-1", !isUsed && "opacity-60")}>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium">
                        Шаблон {slot + 1}
                      </Label>
                      {isUsed
                        ? <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                            Отправляется {usedDays.map(d => `Д+${d}`).join(", ")}
                          </Badge>
                        : <Badge variant="outline" className="h-5 text-[10px] font-normal text-muted-foreground">
                            Не используется в пресете «{presetCfg.label}»
                          </Badge>}
                    </div>
                    <Textarea
                      value={value}
                      onChange={e => updateValueB(slot, e.target.value)}
                      rows={2}
                      className="text-sm resize-y"
                      disabled={loading || !enabled}
                    />
                    <div className={cn(
                      "text-[10px] text-right tabular-nums",
                      overLimit ? "text-destructive font-medium" : "text-muted-foreground",
                    )}>
                      {value.length} / {MAX_MSG_LEN}
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetB}
                  disabled={loading || (!customB && !touchedB)}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  Вернуть к стандарту
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="space-y-3 pt-1">
          <label className="flex items-start justify-between gap-3 py-2 border-b cursor-pointer">
            <div>
              <div className="font-medium text-sm">Остановить, если кандидат ответил «нет»</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Если в ответе кандидата встречается стоп-слово (нет, неинтересно, не подходит и т.п.) — следующие касания отменяются.
              </div>
            </div>
            <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} disabled={loading} />
          </label>
          <label className="flex items-start justify-between gap-3 py-2 cursor-pointer">
            <div>
              <div className="font-medium text-sm">Остановить, если вакансия закрыта</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Когда вакансия переводится в статус «Закрыта» или «Архив» — все запланированные касания отменяются.
              </div>
            </div>
            <Switch checked={stopOnVacancyClosed} onCheckedChange={setStopOnVacancyClosed} disabled={loading} />
          </label>
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} disabled={saving || loading} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
