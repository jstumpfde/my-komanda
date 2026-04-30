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

interface Props {
  vacancyId: string
  initial?: Settings | null
  initialAiScoringEnabled?: boolean
  onSaved?: (settings: Settings, aiScoringEnabled: boolean) => void
}

const DEFAULT_INVITE = "Здравствуйте! Спасибо за отклик. Мы подготовили короткую демонстрацию должности — 15 минут, и вы узнаете всё о задачах, команде и доходе. Перейдите по ссылке: https://company24.pro/demo/invite"
const DEFAULT_REJECT = "Здравствуйте! Спасибо за интерес к нашей вакансии. К сожалению, на данный момент ваш опыт не совсем подходит под наши требования. Желаем удачи в поиске!"

export function VacancyAiProcessSettings({ vacancyId, initial, initialAiScoringEnabled, onSaved }: Props) {
  const [minScore, setMinScore] = useState<number>(initial?.minScore ?? 70)
  const [belowAction, setBelowAction] = useState<"reject" | "keep_new">(
    initial?.belowThresholdAction ?? "reject",
  )
  const [inviteMessage, setInviteMessage] = useState<string>(initial?.inviteMessage ?? DEFAULT_INVITE)
  const [rejectMessage, setRejectMessage] = useState<string>(initial?.rejectMessage ?? DEFAULT_REJECT)
  const [aiScoringEnabled, setAiScoringEnabled] = useState<boolean>(initialAiScoringEnabled ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!initial) return
    if (typeof initial.minScore === "number") setMinScore(initial.minScore)
    if (initial.belowThresholdAction) setBelowAction(initial.belowThresholdAction)
    if (typeof initial.inviteMessage === "string" && initial.inviteMessage.length > 0) {
      setInviteMessage(initial.inviteMessage)
    }
    if (typeof initial.rejectMessage === "string" && initial.rejectMessage.length > 0) {
      setRejectMessage(initial.rejectMessage)
    }
  }, [initial])

  useEffect(() => {
    if (typeof initialAiScoringEnabled === "boolean") setAiScoringEnabled(initialAiScoringEnabled)
  }, [initialAiScoringEnabled])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minScore,
          belowThresholdAction: belowAction,
          inviteMessage,
          rejectMessage,
          aiScoringEnabled,
        }),
      })
      const data = await res.json() as { ok?: boolean; settings?: Settings; aiScoringEnabled?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "Не удалось сохранить")
      toast.success("Настройки AI-обработки сохранены")
      if (data.settings) onSaved?.(data.settings, data.aiScoringEnabled ?? aiScoringEnabled)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          AI-обработка hh-откликов
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Настройки прогона «Разобрать» — порог приглашения, действие при низком скоре и тексты сообщений.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between py-3 border-b">
          <div>
            <div className="font-medium text-sm">AI-скоринг при разборе</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              AI оценивает каждого кандидата перед отправкой демо. Выключите если хотите экономить токены и слать всем подряд.
            </div>
          </div>
          <Switch
            checked={aiScoringEnabled}
            onCheckedChange={setAiScoringEnabled}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-medium">Минимальный AI-скор для приглашения на демо</Label>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">{minScore}</Badge>
          </div>
          <Slider
            value={[minScore]}
            min={0}
            max={95}
            step={5}
            onValueChange={v => setMinScore(v[0] ?? 70)}
            disabled={!aiScoringEnabled}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0 (без фильтра)</span>
            <span>95 (только топ)</span>
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium mb-2 block">Что делать с теми кто ниже порога</Label>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-md border hover:bg-muted/50">
              <input
                type="radio"
                name="below-threshold"
                checked={belowAction === "reject"}
                onChange={() => setBelowAction("reject")}
                className="mt-0.5"
                disabled={!aiScoringEnabled}
              />
              <span>
                <span className="font-medium">Перевести в «Отказ» + отправить текст отказа</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Кандидат сразу получит мягкий отказ в hh, карточка попадёт в стадию «Отказ».
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-md border hover:bg-muted/50">
              <input
                type="radio"
                name="below-threshold"
                checked={belowAction === "keep_new"}
                onChange={() => setBelowAction("keep_new")}
                className="mt-0.5"
                disabled={!aiScoringEnabled}
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

        <div>
          <Label className="text-xs font-medium mb-1.5 block">Текст приглашения на демо</Label>
          <Textarea
            value={inviteMessage}
            onChange={e => setInviteMessage(e.target.value)}
            rows={4}
            placeholder={DEFAULT_INVITE}
            className="text-sm resize-y"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Можно использовать [Имя], [должность], [компания], [ссылка] — будут подставлены автоматически.
          </p>
        </div>

        <div>
          <Label className="text-xs font-medium mb-1.5 block">Текст мягкого отказа</Label>
          <Textarea
            value={rejectMessage}
            onChange={e => setRejectMessage(e.target.value)}
            rows={4}
            placeholder={DEFAULT_REJECT}
            className="text-sm resize-y"
            disabled={!aiScoringEnabled}
          />
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
