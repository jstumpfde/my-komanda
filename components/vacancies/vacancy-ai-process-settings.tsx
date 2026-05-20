"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Loader2, Save, Sparkles } from "lucide-react"
import { toast } from "sonner"
import type { VacancyAiProcessSettings as Settings } from "@/lib/db/schema"
import { DEFAULT_REJECT_MESSAGE } from "@/lib/hh/default-messages"

interface Props {
  vacancyId: string
  initial?: Settings | null
  initialAiScoringEnabled?: boolean
  onSaved?: (settings: Settings, aiScoringEnabled: boolean) => void
}

// DEFAULT_REJECT_MESSAGE — единый источник для UI placeholder/initial-state
// и backend-fallback в sync-stage.ts / process-queue.ts. Поддерживает
// плейсхолдеры {{name}}, {{vacancy}} — рендерятся в момент отправки.
const DEFAULT_REJECT = DEFAULT_REJECT_MESSAGE

const DEFAULT_UPPER = 75
const DEFAULT_LOWER = 40
const MIN_GAP = 5   // min зазор между upper и lower

type MidRangeAction = "prequalification" | "direct_demo" | "keep_new"

export function VacancyAiProcessSettings({ vacancyId, initial, initialAiScoringEnabled, onSaved }: Props) {
  // Master-toggle переключает aiScoringEnabled. Default OFF (Сессия 6).
  const [aiScoringEnabled, setAiScoringEnabled] = useState<boolean>(initialAiScoringEnabled ?? false)

  // Пороги. minScoreLower — новый ключ; minScore — legacy fallback.
  const [upper, setUpper] = useState<number>(
    initial?.minScoreUpper ?? DEFAULT_UPPER,
  )
  const [lower, setLower] = useState<number>(
    initial?.minScoreLower ?? initial?.minScore ?? DEFAULT_LOWER,
  )
  // Дефолт для НОВЫХ вакансий — "direct_demo" (P0-7): средние кандидаты
  // сразу получают приглашение на демо без ручного разбора. Это снижает
  // нагрузку на HR и повышает конверсию. Backward-compat: если в БД
  // явно сохранён "keep_new" (legacy belowThresholdAction) — уважаем.
  const [midRangeAction, setMidRangeAction] = useState<MidRangeAction>(
    initial?.midRangeAction ?? (
      initial?.belowThresholdAction === "keep_new" ? "keep_new" : "direct_demo"
    ),
  )
  const [rejectMessage, setRejectMessage] = useState<string>(initial?.rejectMessage ?? DEFAULT_REJECT)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!initial) return
    if (typeof initial.minScoreUpper === "number") setUpper(initial.minScoreUpper)
    if (typeof initial.minScoreLower === "number") setLower(initial.minScoreLower)
    else if (typeof initial.minScore === "number") setLower(initial.minScore)
    if (initial.midRangeAction) setMidRangeAction(initial.midRangeAction)
    else if (initial.belowThresholdAction === "keep_new") setMidRangeAction("keep_new")
    if (typeof initial.rejectMessage === "string" && initial.rejectMessage.length > 0) {
      setRejectMessage(initial.rejectMessage)
    }
  }, [initial])

  useEffect(() => {
    if (typeof initialAiScoringEnabled === "boolean") setAiScoringEnabled(initialAiScoringEnabled)
  }, [initialAiScoringEnabled])

  // Гарантируем upper > lower + MIN_GAP.
  const handleUpper = (v: number) => {
    setUpper(v)
    if (lower >= v - MIN_GAP) setLower(Math.max(0, v - MIN_GAP))
  }
  const handleLower = (v: number) => {
    setLower(v)
    if (upper <= v + MIN_GAP) setUpper(Math.min(100, v + MIN_GAP))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minScoreUpper:        upper,
          minScoreLower:        lower,
          // backward compat — отправляем legacy minScore = lower тоже,
          // чтобы старые читатели (если такие где-то ещё остались) работали.
          minScore:             lower,
          midRangeAction,
          rejectMessage,
          aiScoringEnabled,
        }),
      })
      const data = await res.json() as { ok?: boolean; settings?: Settings; aiScoringEnabled?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "Не удалось сохранить")
      toast.success("Настройки AI-фильтра сохранены")
      if (data.settings) onSaved?.(data.settings, data.aiScoringEnabled ?? aiScoringEnabled)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const disabled = !aiScoringEnabled

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI-фильтр откликов
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              AI оценивает резюме каждого кандидата перед действием. Выключите, если хотите экономить токены и обрабатывать всех одинаково.
            </p>
          </div>
          <Switch checked={aiScoringEnabled} onCheckedChange={setAiScoringEnabled} />
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-5", disabled && "opacity-60")}>
        {/* Два слайдера: верхний (сразу демо) и нижний (отказ). */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium">Верхний порог (сразу демо)</Label>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">{upper}</Badge>
            </div>
            <Slider
              value={[upper]}
              min={MIN_GAP}
              max={100}
              step={5}
              onValueChange={v => handleUpper(v[0] ?? DEFAULT_UPPER)}
              disabled={disabled}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium">Нижний порог (отказ)</Label>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">{lower}</Badge>
            </div>
            <Slider
              value={[lower]}
              min={0}
              max={100 - MIN_GAP}
              step={5}
              onValueChange={v => handleLower(v[0] ?? DEFAULT_LOWER)}
              disabled={disabled}
            />
          </div>

          <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border space-y-0.5">
            <div>🟢 ≥{upper} — сильное резюме, отправляем демо сразу</div>
            <div>🟡 {lower}–{upper - 1} — среднее, требует уточнения</div>
            <div>🔴 &lt;{lower} — не подходит, мягкий отказ</div>
          </div>
        </div>

        {/* Mid-range action — 3 radio. */}
        <div>
          <Label className="text-xs font-medium mb-2 block">Что делать с теми кто между порогами ({lower}–{upper - 1})</Label>
          <div className="text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2 mb-2">
            ✅ Рекомендуемое действие для средних кандидатов — сразу демо. Это снижает нагрузку на HR и повышает конверсию.
          </div>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-md border hover:bg-muted/50">
              <input
                type="radio"
                name="mid-range"
                checked={midRangeAction === "prequalification"}
                onChange={() => setMidRangeAction("prequalification")}
                className="mt-0.5"
                disabled={disabled}
              />
              <span>
                <span className="font-medium">Предквалификация (если включена в табе «Демо и воронка»)</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  3 уточняющих вопроса перед демо. Если предкв выключена — таких кандидатов сразу шлём на демо.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-md border hover:bg-muted/50">
              <input
                type="radio"
                name="mid-range"
                checked={midRangeAction === "direct_demo"}
                onChange={() => setMidRangeAction("direct_demo")}
                className="mt-0.5"
                disabled={disabled}
              />
              <span>
                <span className="font-medium">Сразу демо (без предквалификации)</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Все средние резюме получают приглашение на демо без уточнений.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-md border hover:bg-muted/50">
              <input
                type="radio"
                name="mid-range"
                checked={midRangeAction === "keep_new"}
                onChange={() => setMidRangeAction("keep_new")}
                className="mt-0.5"
                disabled={disabled}
              />
              <span>
                <span className="font-medium">Оставить в «Новый» для ручного разбора</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Сообщения в hh не отправляются, кандидат остаётся в стадии «Новый» с AI-комментарием.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Текст мягкого отказа (для тех кто <lower). */}
        <div>
          <Label className="text-xs font-medium mb-1.5 block">Текст мягкого отказа (для тех кто &lt;{lower})</Label>
          <Textarea
            value={rejectMessage}
            onChange={e => setRejectMessage(e.target.value)}
            rows={4}
            placeholder={DEFAULT_REJECT}
            className="text-sm resize-y"
            disabled={disabled}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Поддерживает плейсхолдеры:{" "}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{name}}"}</code> — имя кандидата,{" "}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{vacancy}}"}</code> — название вакансии.
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// helper: cn (используется внутри компонента, чтобы не плодить лишних импортов)
function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ")
}
