"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Loader2, Save, MessageSquareText } from "lucide-react"
import { format, addDays } from "date-fns"
import { ru } from "date-fns/locale"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FOLLOWUP_PRESETS, type FollowUpPreset } from "@/lib/followup/presets"
import { DEFAULT_FOLLOWUP_MESSAGES } from "@/lib/followup/default-messages"

interface Campaign {
  id: string
  vacancyId: string
  preset: string
  enabled: boolean
  stopOnReply: boolean
  stopOnVacancyClosed: boolean
  customMessages: string[] | null
}

interface Props {
  vacancyId: string
}

const PRESET_ORDER: FollowUpPreset[] = ["off", "soft", "standard", "aggressive"]

export function VacancyFollowupSettings({ vacancyId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState<FollowUpPreset>("off")
  const [stopOnReply, setStopOnReply] = useState(true)
  const [stopOnVacancyClosed, setStopOnVacancyClosed] = useState(true)

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
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, preset, stopOnReply, stopOnVacancyClosed }),
      })
      const data = await res.json() as { campaign?: Campaign; error?: string }
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить")
      toast.success("Настройки воронки дожима сохранены")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const today = new Date()
  const days = FOLLOWUP_PRESETS[preset].days

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
                    title={DEFAULT_FOLLOWUP_MESSAGES[idx] ?? DEFAULT_FOLLOWUP_MESSAGES[DEFAULT_FOLLOWUP_MESSAGES.length - 1]}
                  >
                    <span className="font-medium">Д{dayOffset === 0 ? "0" : `+${dayOffset}`}</span>
                    <span className="text-muted-foreground ml-1.5">
                      {format(date, "d MMM", { locale: ru })}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Тексты касаний — дефолтные ({DEFAULT_FOLLOWUP_MESSAGES.length} вариантов с разными углами).
              Кастомные тексты — следующая итерация.
            </p>
          </div>
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
