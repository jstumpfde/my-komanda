"use client"

// #16/#25: настройки текстов двух финальных экранов демо.
// Хранятся в vacancies.descriptionJson.finalScreens.
//
//   afterVideo  — экран после видео-уроков и видео-визитки, ДО анкеты.
//                 Заголовок / подзаголовок / кнопка перехода к анкете.
//   afterAnketa — финальный экран ПОСЛЕ отправки анкеты. Заголовок / текст.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Save, Loader2 } from "lucide-react"
import { toast } from "sonner"

export interface FinalScreensConfig {
  afterVideo?:  { title?: string; subtitle?: string; button?: string }
  afterAnketa?: { title?: string; subtitle?: string }
}

export const DEFAULT_AFTER_VIDEO = {
  title:    "Спасибо за прохождение!",
  subtitle: "Заполните короткую анкету и мы свяжемся в чате",
  button:   "Заполнить анкету",
} as const

export const DEFAULT_AFTER_ANKETA = {
  title:    "Спасибо!",
  subtitle: "Мы изучим вашу анкету и свяжемся в чате",
} as const

interface Props {
  vacancyId: string
  initial?: FinalScreensConfig | null
  onSaved?: (cfg: FinalScreensConfig) => void
}

export function FinalScreensSettings({ vacancyId, initial, onSaved }: Props) {
  const init = initial ?? {}
  const [avTitle,    setAvTitle]    = useState(init.afterVideo?.title  ?? "")
  const [avSubtitle, setAvSubtitle] = useState(init.afterVideo?.subtitle ?? "")
  const [avButton,   setAvButton]   = useState(init.afterVideo?.button ?? "")
  const [aaTitle,    setAaTitle]    = useState(init.afterAnketa?.title ?? "")
  const [aaSubtitle, setAaSubtitle] = useState(init.afterAnketa?.subtitle ?? "")
  const [saving, setSaving] = useState(false)
  const [savedBaseline, setSavedBaseline] = useState({
    avTitle: init.afterVideo?.title ?? "", avSubtitle: init.afterVideo?.subtitle ?? "", avButton: init.afterVideo?.button ?? "",
    aaTitle: init.afterAnketa?.title ?? "", aaSubtitle: init.afterAnketa?.subtitle ?? "",
  })

  // Если initial обновился извне (refetch) и нет локальных правок — догоняемся.
  useEffect(() => {
    if (!initial) return
    const incoming = {
      avTitle: initial.afterVideo?.title ?? "", avSubtitle: initial.afterVideo?.subtitle ?? "", avButton: initial.afterVideo?.button ?? "",
      aaTitle: initial.afterAnketa?.title ?? "", aaSubtitle: initial.afterAnketa?.subtitle ?? "",
    }
    if (JSON.stringify(incoming) === JSON.stringify(savedBaseline)) return
    if (avTitle === savedBaseline.avTitle && avSubtitle === savedBaseline.avSubtitle && avButton === savedBaseline.avButton
      && aaTitle === savedBaseline.aaTitle && aaSubtitle === savedBaseline.aaSubtitle) {
      setAvTitle(incoming.avTitle); setAvSubtitle(incoming.avSubtitle); setAvButton(incoming.avButton)
      setAaTitle(incoming.aaTitle); setAaSubtitle(incoming.aaSubtitle)
      setSavedBaseline(incoming)
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify({ avTitle, avSubtitle, avButton, aaTitle, aaSubtitle }) !== JSON.stringify(savedBaseline)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/final-screens`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          afterVideo:  { title: avTitle, subtitle: avSubtitle, button: avButton },
          afterAnketa: { title: aaTitle, subtitle: aaSubtitle },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      const json = await res.json() as { finalScreens?: FinalScreensConfig }
      const saved = json.finalScreens ?? null
      setSavedBaseline({ avTitle, avSubtitle, avButton, aaTitle, aaSubtitle })
      if (saved) onSaved?.(saved)
      toast.success("Тексты экранов сохранены")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Финальные экраны</CardTitle>
        <CardDescription>
          Тексты двух экранов на демо-странице: после видео-визитки (перед анкетой)
          и после отправки анкеты. Если поля пустые — используются дефолты.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">Экран после видео-визитки (перед анкетой)</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Показывается после прохождения уроков и видео-визитки. Кнопка ведёт на анкету.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Заголовок</Label>
            <Input
              value={avTitle}
              onChange={(e) => setAvTitle(e.target.value)}
              placeholder={DEFAULT_AFTER_VIDEO.title}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Подзаголовок</Label>
            <Textarea
              value={avSubtitle}
              onChange={(e) => setAvSubtitle(e.target.value)}
              placeholder={DEFAULT_AFTER_VIDEO.subtitle}
              rows={2}
              className="text-sm resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Кнопка</Label>
            <Input
              value={avButton}
              onChange={(e) => setAvButton(e.target.value)}
              placeholder={DEFAULT_AFTER_VIDEO.button}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <h4 className="text-sm font-semibold">Финальный экран после анкеты</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Показывается после отправки анкеты. #17: без выбора времени интервью.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Заголовок</Label>
            <Input
              value={aaTitle}
              onChange={(e) => setAaTitle(e.target.value)}
              placeholder={DEFAULT_AFTER_ANKETA.title}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Текст</Label>
            <Textarea
              value={aaSubtitle}
              onChange={(e) => setAaSubtitle(e.target.value)}
              placeholder={DEFAULT_AFTER_ANKETA.subtitle}
              rows={3}
              className="text-sm resize-y"
            />
          </div>
        </div>

        {dirty && (
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Сохраняем..." : "Сохранить тексты"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
