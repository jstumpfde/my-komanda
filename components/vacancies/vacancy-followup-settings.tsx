"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Loader2, Save, MessageSquareText, RotateCcw } from "lucide-react"
import { format, addDays } from "date-fns"
import { ru } from "date-fns/locale"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FOLLOWUP_PRESETS, type FollowUpPreset } from "@/lib/followup/presets"
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

// Заполняем массив до требуемой длины — пустые слоты заменяем на defaults[i].
function padWithDefaults(values: string[] | null, defaults: string[], count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const v = values?.[i]
    out.push(typeof v === "string" ? v : (defaults[i] ?? defaults[defaults.length - 1] ?? ""))
  }
  return out
}

export function VacancyFollowupSettings({ vacancyId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState<FollowUpPreset>("off")
  const [stopOnReply, setStopOnReply] = useState(true)
  const [stopOnVacancyClosed, setStopOnVacancyClosed] = useState(true)

  // Кастомные тексты: null = "используем дефолты", array = "юзер настроил
  // свои тексты". При onChange любого textarea state становится array
  // и при сохранении уходит в PATCH. Кнопка «Вернуть к стандарту» делает
  // обратно null и тоже отправляет null (явный сброс на бэке).
  const [customA, setCustomA] = useState<string[] | null>(null)
  const [customB, setCustomB] = useState<string[] | null>(null)
  // Флаги «юзер трогал поле в этой сессии» — нужны чтобы при handleSave
  // не отправлять customMessages/customMessagesOpened если юзер их вообще
  // не открывал (иначе можем затереть значения из БД).
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
      // Сбрасываем «trace touched» — после успешного сохранения значения в БД
      // совпадают с UI, и следующий save не должен повторно их отправлять, если
      // юзер не редактировал заново.
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

  const today = new Date()
  const days = FOLLOWUP_PRESETS[preset].days
  const touchCount = days.length

  // Значения для textarea: либо custom, либо подставленные дефолты.
  const valuesA = padWithDefaults(customA, DEFAULT_FOLLOWUP_NOT_OPENED, touchCount)
  const valuesB = padWithDefaults(customB, DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED, touchCount)

  const updateValueA = (idx: number, value: string) => {
    setTouchedA(true)
    const next = customA ? [...customA] : [...valuesA]
    next[idx] = value
    setCustomA(next)
  }
  const updateValueB = (idx: number, value: string) => {
    setTouchedB(true)
    const next = customB ? [...customB] : [...valuesB]
    next[idx] = value
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

        {days.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Расписание касаний (от даты приглашения):
            </div>
            <div className="flex flex-wrap gap-2">
              {days.map((dayOffset, idx) => {
                const date = addDays(today, dayOffset)
                return (
                  <div
                    key={idx}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    title={valuesA[idx] ?? ""}
                  >
                    <span className="font-medium">Д{dayOffset === 0 ? "0" : `+${dayOffset}`}</span>
                    <span className="text-muted-foreground ml-1.5">
                      {format(date, "d MMM", { locale: ru })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {touchCount > 0 && (
          <Accordion type="multiple" className="rounded-md border">
            <AccordionItem value="branch-a" className="px-3">
              <AccordionTrigger className="text-sm">
                <div className="flex-1 text-left">
                  <div className="font-medium">Тексты для тех, кто не открыл демо</div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-normal">
                    Ветка А — {touchCount} касан{touchCount === 1 ? "ие" : touchCount < 5 ? "ия" : "ий"}
                    {customA ? " · кастом" : " · стандарт"}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 border">
                  Плейсхолдеры:{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{Имя}"}</code>,{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{должность}"}</code>,{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{компания}"}</code>,{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{ссылка}"}</code>.{" "}
                  <span className="opacity-70">
                    {"{{name}}"} и {"{{vacancy}}"} здесь не работают — это для текста отказа.
                  </span>
                </p>
                {days.map((dayOffset, idx) => {
                  const value = valuesA[idx] ?? ""
                  const overLimit = value.length > MAX_MSG_LEN
                  return (
                    <div key={idx} className="space-y-1">
                      <Label className="text-xs font-medium">
                        Касание {idx + 1} — через {dayOffset === 0 ? "сразу" : `${dayOffset} д.`}
                      </Label>
                      <Textarea
                        value={value}
                        onChange={e => updateValueA(idx, e.target.value)}
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
                    Ветка Б — {touchCount} касан{touchCount === 1 ? "ие" : touchCount < 5 ? "ия" : "ий"}
                    {customB ? " · кастом" : " · стандарт"}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 border">
                  Плейсхолдеры:{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{Имя}"}</code>,{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{должность}"}</code>,{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{компания}"}</code>,{" "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{ссылка}"}</code>.
                </p>
                {days.map((dayOffset, idx) => {
                  const value = valuesB[idx] ?? ""
                  const overLimit = value.length > MAX_MSG_LEN
                  return (
                    <div key={idx} className="space-y-1">
                      <Label className="text-xs font-medium">
                        Касание {idx + 1} — через {dayOffset === 0 ? "сразу" : `${dayOffset} д.`}
                      </Label>
                      <Textarea
                        value={value}
                        onChange={e => updateValueB(idx, e.target.value)}
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
        )}

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
