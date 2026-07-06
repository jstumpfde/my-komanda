"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Loader2, MessageSquareText, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FOLLOWUP_PRESETS, FOLLOWUP_MESSAGE_SLOTS, type FollowUpPreset } from "@/lib/followup/presets"
import {
  DEFAULT_FOLLOWUP_NOT_OPENED,
  DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED,
} from "@/lib/followup/default-messages"
import { useVacancySectionRegister, type VacancyTabKey } from "./vacancy-settings-context"

interface Campaign {
  id: string
  vacancyId: string
  preset: string
  enabled: boolean
  stopOnReply: boolean
  stopOnVacancyClosed: boolean
  customMessages: string[] | null
  customMessagesOpened: string[] | null
  minPortraitScoreEnabled?: boolean
  minPortraitScore?: number
}

interface Props {
  vacancyId: string
  /** Группа 35: для funnel-builder Sheet передаём "funnel-builder", чтобы
   *  pending-индикатор появлялся на правильном табе. Дефолт — "followup"
   *  (когда компонент рендерится на standalone-табе вакансии). */
  tabKey?:   VacancyTabKey
  /** Колбэк после успешного сохранения (например — закрыть Sheet). */
  onSaved?:  () => void
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

export function VacancyFollowupSettings({ vacancyId, tabKey = "followup", onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState<FollowUpPreset>("off")
  const [stopOnReply, setStopOnReply] = useState(true)
  const [stopOnVacancyClosed, setStopOnVacancyClosed] = useState(true)
  // Гейт «не дожимать кандидатов с Портретом ниже N» (drizzle/0259, инцидент
  // 06.07). Дефолт ВЫКЛ + порог 30 — legacy-инвариант, поведение не меняется
  // пока HR явно не включит.
  const [minPortraitScoreEnabled, setMinPortraitScoreEnabled] = useState(false)
  const [minPortraitScore, setMinPortraitScore] = useState(30)

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

  // Группа 35: кастомные дни касаний. null = «используем preset.days».
  // Хранится в vacancy.descriptionJson.followupCustomDays (отдельный PATCH).
  const [customDays, setCustomDays] = useState<number[] | null>(null)
  const [touchedDays, setTouchedDays] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [campaignRes, vacancyRes] = await Promise.all([
          fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`),
          fetch(`/api/modules/hr/vacancies/${vacancyId}`),
        ])
        const data = await campaignRes.json() as { campaign?: Campaign | null }
        const vacancyData = vacancyRes.ok
          ? (await vacancyRes.json().catch(() => null) as { descriptionJson?: Record<string, unknown> | null } | null)
          : null
        if (cancelled) return
        if (data.campaign) {
          setEnabled(data.campaign.enabled)
          const p = data.campaign.preset
          setPreset((PRESET_ORDER.includes(p as FollowUpPreset) ? p : "off") as FollowUpPreset)
          setStopOnReply(data.campaign.stopOnReply)
          setStopOnVacancyClosed(data.campaign.stopOnVacancyClosed)
          setCustomA(data.campaign.customMessages ?? null)
          setCustomB(data.campaign.customMessagesOpened ?? null)
          setMinPortraitScoreEnabled(data.campaign.minPortraitScoreEnabled ?? false)
          setMinPortraitScore(
            typeof data.campaign.minPortraitScore === "number" ? data.campaign.minPortraitScore : 30,
          )
        }
        // Группа 35: кастомные дни из descriptionJson.
        const dj = vacancyData?.descriptionJson
        if (dj && typeof dj === "object" && Array.isArray((dj as Record<string, unknown>).followupCustomDays)) {
          const raw = (dj as Record<string, unknown>).followupCustomDays as unknown[]
          const days = raw
            .map(d => Number(d))
            .filter(d => Number.isFinite(d) && d >= 1 && d <= 365)
          setCustomDays(days.length > 0 ? days.sort((a, b) => a - b) : null)
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
      const body: Record<string, unknown> = {
        enabled, preset, stopOnReply, stopOnVacancyClosed,
        minPortraitScoreEnabled, minPortraitScore,
      }
      if (touchedA) body.customMessages = customA
      if (touchedB) body.customMessagesOpened = customB
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/followup-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { campaign?: Campaign; error?: string }
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить")

      // Группа 35: customDays живут в vacancy.descriptionJson — отдельный
      // PATCH на основную ручку вакансии. Сохраняем ТОЛЬКО если HR-у трогал
      // редактор (touchedDays) — чтобы не затирать чужие поля descriptionJson.
      if (touchedDays) {
        const dj = customDays && customDays.length > 0
          ? { followupCustomDays: [...customDays].sort((a, b) => a - b) }
          : { followupCustomDays: null }
        const r2 = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description_json: dj }),
        })
        if (!r2.ok) throw new Error("Не удалось сохранить расписание")
      }

      toast.success("Настройки воронки дожима сохранены")
      setTouchedA(false)
      setTouchedB(false)
      setTouchedDays(false)
      if (data.campaign) {
        setCustomA(data.campaign.customMessages ?? null)
        setCustomB(data.campaign.customMessagesOpened ?? null)
        setMinPortraitScoreEnabled(data.campaign.minPortraitScoreEnabled ?? false)
        setMinPortraitScore(
          typeof data.campaign.minPortraitScore === "number" ? data.campaign.minPortraitScore : 30,
        )
      }
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  useVacancySectionRegister({
    sectionKey: `followup:${vacancyId}`,
    tabKey,
    loaded: !loading,
    watchedValues: {
      enabled, preset, stopOnReply, stopOnVacancyClosed,
      customA, customB, customDays,
      touchedA, touchedB, touchedDays,
      minPortraitScoreEnabled, minPortraitScore,
    },
    save: handleSave,
  })

  // Группа 35: локальный isDirty для inline-кнопки «Сохранить».
  // Параллельно с useVacancySectionRegister — даёт HR явный визуальный
  // сигнал «есть несохранённые изменения» и работает даже если глобальный
  // sticky-saver скрыт overlay'ем Sheet.
  const initialRef = useRef<string | null>(null)
  const currentSnapshot = useMemo(
    () => JSON.stringify({
      enabled, preset, stopOnReply, stopOnVacancyClosed,
      customA, customB, customDays,
      minPortraitScoreEnabled, minPortraitScore,
    }),
    [enabled, preset, stopOnReply, stopOnVacancyClosed, customA, customB, customDays, minPortraitScoreEnabled, minPortraitScore],
  )
  useEffect(() => {
    if (loading) return
    if (initialRef.current === null) initialRef.current = currentSnapshot
  }, [loading, currentSnapshot])
  useEffect(() => {
    if (!saving && initialRef.current !== null) {
      // После успешного save handleSave() уже обнуляет touchedA/B/Days;
      // подтягиваем baseline на актуальное состояние.
      initialRef.current = JSON.stringify({
        enabled, preset, stopOnReply, stopOnVacancyClosed,
        customA, customB, customDays,
        minPortraitScoreEnabled, minPortraitScore,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving])
  const isDirty = !loading && initialRef.current !== null && initialRef.current !== currentSnapshot

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

        {/* Группа 35: редактируемое расписание касаний.
            customDays перекрывает preset.days. Любой день 1-365, автосортировка. */}
        {(presetCfg.days.length > 0 || customDays !== null) && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                Расписание касаний (Д = день приглашения кандидата)
              </div>
              {customDays !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-[11px]"
                  onClick={() => { setTouchedDays(true); setCustomDays(null) }}
                  disabled={loading || !enabled}
                >
                  <RotateCcw className="w-3 h-3" />
                  Вернуть к пресету
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(customDays ?? presetCfg.days).map((dayOffset, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md border bg-background pl-2 pr-1 py-0.5"
                >
                  <span className="text-[11px] text-muted-foreground">Д+</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={dayOffset}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(365, Number(e.target.value) || 1))
                      setTouchedDays(true)
                      const current = customDays ?? [...presetCfg.days]
                      const next = [...current]
                      next[idx] = v
                      // Автосортировка по возрастанию + дедупликация.
                      setCustomDays(Array.from(new Set(next)).sort((a, b) => a - b))
                    }}
                    disabled={loading || !enabled}
                    className="h-6 w-14 text-xs px-1 tabular-nums"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    disabled={loading || !enabled || (customDays ?? presetCfg.days).length <= 1}
                    onClick={() => {
                      setTouchedDays(true)
                      const current = customDays ?? [...presetCfg.days]
                      setCustomDays(current.filter((_, i) => i !== idx))
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                disabled={loading || !enabled || (customDays ?? presetCfg.days).length >= FOLLOWUP_MESSAGE_SLOTS}
                onClick={() => {
                  setTouchedDays(true)
                  const current = customDays ?? [...presetCfg.days]
                  const maxDay = current.length > 0 ? Math.max(...current) : 0
                  setCustomDays([...current, maxDay + 1].sort((a, b) => a - b))
                }}
              >
                <Plus className="w-3 h-3" />
                Добавить день
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {customDays !== null
                ? "Кастомное расписание. Текст касания берётся из шаблонов 1…N по порядку дней."
                : `Пресет «${FOLLOWUP_PRESETS[preset].label}». Измените любой день — расписание станет кастомным.`}
            </p>
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
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{name}}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{vacancy}}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{demo_link}}"}</code>.
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
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{name}}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{vacancy}}"}</code>,{" "}
                <code className="text-[10px] bg-background px-1 py-0.5 rounded border">{"{{demo_link}}"}</code>.
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
              <div className="font-medium text-sm">Использовать стоп-слова</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Список редактируется в этой же вкладке «Портрет» → «Автоответы кандидату» → «Стоп-слова → отказ».
                Если найдено хотя бы одно совпадение — следующие касания отменяются, стадия → «Отказ».
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

          {/* Инцидент 06.07: дожим слал комплиментарный текст кандидату с
              Портрет-баллом 0. Тексты касаний не трогаем (шаблоны клиента) —
              просто скипаем касание, если Портрет ниже порога. Дефолт ВЫКЛ. */}
          <div className="flex items-start justify-between gap-3 py-2 border-t">
            <div className="flex-1">
              <label className="font-medium text-sm cursor-pointer" htmlFor="min-portrait-toggle">
                Не дожимать кандидатов с Портретом ниже
              </label>
              <div className="text-xs text-muted-foreground mt-0.5">
                Касания дожима пропускаются (не отменяются — если балл пересчитают выше порога, дожим продолжится).
                Сами тексты касаний не меняются.
              </div>
              {minPortraitScoreEnabled && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={minPortraitScore}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                      setMinPortraitScore(v)
                    }}
                    disabled={loading}
                    className="h-8 w-20 text-sm tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">баллов (0–100)</span>
                </div>
              )}
            </div>
            <Switch
              id="min-portrait-toggle"
              checked={minPortraitScoreEnabled}
              onCheckedChange={setMinPortraitScoreEnabled}
              disabled={loading}
            />
          </div>
        </div>

        {/* Группа 35: явная inline-кнопка «Сохранить» с индикатором dirty.
            Дублирует sticky-кнопку из VacancySettingsProvider — нужна
            потому что в funnel-builder Sheet sticky-bar может быть закрыт
            overlay'ем, а HR должен видеть, что изменения зафиксировались. */}
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <div className="text-xs">
            {isDirty ? (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                Есть несохранённые изменения
              </Badge>
            ) : (
              <span className="text-muted-foreground">Изменений нет</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => { void handleSave() }}
            disabled={loading || saving || !isDirty}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
