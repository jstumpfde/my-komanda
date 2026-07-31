"use client"

// 14.07 (осиротевшие настройки, Ф.А): экран «Вы записаны на интервью!» на
// публичной странице /schedule/[token] сразу после брони. Хранится в
// vacancies.description_json.interviewBookedScreen {title, text} — API
// (app/api/public/schedule/[token]/route.ts:buildBookedScreenTexts) уже
// читал это поле (#26.4), но постоянного редактора в «Коммуникациях» не было.
//
// Сохранение — точечный PATCH description_json на общий роут вакансии
// (см. lib/vacancies/description-json-merge.ts): interviewBookedScreen НЕ
// входит в INDEPENDENTLY_MANAGED_KEYS, поэтому root-merge сохраняет его
// вместе с остальными секциями без выделенного роута (тот же приём, что и
// у hiddenColumns/customColumns/branding в карточке вакансии).
//
// Пустое поле = платформенный дефолт (DEFAULT_INTERVIEW_BOOKED_TITLE/TEXT,
// lib/hh/default-messages.ts), байт-в-байт — единый источник с backend.
// {{дата, время}} подставляется сервером из подтверждённого слота.

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { CalendarCheck2, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { DEFAULT_INTERVIEW_BOOKED_TITLE, DEFAULT_INTERVIEW_BOOKED_TEXT } from "@/lib/hh/default-messages"

export interface InterviewBookedScreenConfig {
  title?: string
  text?: string
}

interface Props {
  vacancyId: string
  initial?: InterviewBookedScreenConfig | null
  onSaved?: (cfg: InterviewBookedScreenConfig) => void
}

export function InterviewBookedScreenSettings({ vacancyId, initial, onSaved }: Props) {
  const init = initial ?? {}
  const [title, setTitle] = useState(init.title ?? "")
  const [text, setText] = useState(init.text ?? "")
  const [saving, setSaving] = useState(false)
  const [savedBaseline, setSavedBaseline] = useState({ title: init.title ?? "", text: init.text ?? "" })
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  const dirty = title !== savedBaseline.title || text !== savedBaseline.text

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description_json: { interviewBookedScreen: { title, text } } }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      setSavedBaseline({ title, text })
      onSaved?.({ title, text })
      toast.success("Сохранено")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck2 className="w-4 h-4" />
          Экран «Вы записаны»
        </CardTitle>
        <CardDescription className="mt-1">
          Показывается кандидату сразу после брони интервью на публичной странице записи.
          Если поля пустые — используется стандартный текст.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Заголовок</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={DEFAULT_INTERVIEW_BOOKED_TITLE}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Текст</Label>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={DEFAULT_INTERVIEW_BOOKED_TEXT}
            rows={4}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-[var(--input-bg)] px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] resize-y min-h-16 leading-relaxed"
          />
          <PlaceholderBadges
            textareaRef={textRef}
            placeholders={["дата, время"]}
            value={text}
            onValueChange={setText}
          />
          <p className="text-[11px] text-muted-foreground">
            {"{{дата, время}}"} — подставляется сервером из подтверждённого слота записи.
          </p>
        </div>

        {dirty && (
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
