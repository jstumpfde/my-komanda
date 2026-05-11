"use client"

// Секция «Публичная анкета» внутри таба «Анкета» (Ф5 2026-05-10).
// Три карточки:
//   1. «Текст для кандидата» — заголовок и описание (intro)
//   2. «Финальная анкета» — поля формы (через PostDemoSettings sections=["formFields"])
//   3. «Дозапрос данных» — через AutomationSettings sections=["enrichment"]
//
// Intro хранится в vacancies.description_json.anketaIntro,
// API PATCH /api/modules/hr/vacancies/[id]/anketa-intro.

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Loader2, Save, FileText } from "lucide-react"
import { toast } from "sonner"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import { AutomationSettings } from "@/components/vacancies/automation-settings"

export const DEFAULT_ANKETA_INTRO_TITLE = "Заполните ваши данные!"
export const DEFAULT_ANKETA_INTRO_DESCRIPTION =
  "Мы разберём ваши ответы — в том числе ответы на вопросы. Все данные конфиденциальны.\n\nЖдём Вас!"

export interface AnketaPublicSectionProps {
  vacancyId: string
  descriptionJson: unknown
}

interface IntroState {
  title: string
  description: string
}

function readIntro(descriptionJson: unknown): IntroState {
  if (descriptionJson && typeof descriptionJson === "object") {
    const raw = (descriptionJson as Record<string, unknown>).anketaIntro
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>
      return {
        title: typeof obj.title === "string" ? obj.title : "",
        description: typeof obj.description === "string" ? obj.description : "",
      }
    }
  }
  return { title: "", description: "" }
}

export function AnketaPublicSection({ vacancyId, descriptionJson }: AnketaPublicSectionProps) {
  const [intro, setIntro] = useState<IntroState>(() => readIntro(descriptionJson))
  const [saved, setSaved] = useState<IntroState>(() => readIntro(descriptionJson))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const next = readIntro(descriptionJson)
    setIntro(next)
    setSaved(next)
  }, [descriptionJson])

  const dirty = intro.title !== saved.title || intro.description !== saved.description

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/anketa-intro`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: intro.title, description: intro.description }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaved(intro)
      toast.success("Текст анкеты сохранён")
    } catch {
      toast.error("Не удалось сохранить текст анкеты")
    } finally {
      setSaving(false)
    }
  }, [vacancyId, intro])

  return (
    <div className="space-y-6 mt-8 pt-8 border-t-2 border-dashed">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Публичная анкета для кандидата
        </h2>
        <p className="text-sm text-muted-foreground">
          Текст, поля и дозапрос данных — что видит кандидат после прохождения демо.
        </p>
      </div>

      {/* 1. Текст-обёртка */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Текст для кандидата</CardTitle>
          <CardDescription>
            Заголовок и описание над формой. Видны кандидату сразу после демо-курса.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Заголовок</Label>
            <Input
              value={intro.title}
              onChange={(e) => setIntro(prev => ({ ...prev, title: e.target.value }))}
              placeholder={DEFAULT_ANKETA_INTRO_TITLE}
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground">
              Пусто → используется «{DEFAULT_ANKETA_INTRO_TITLE}»
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Описание</Label>
            <Textarea
              value={intro.description}
              onChange={(e) => setIntro(prev => ({ ...prev, description: e.target.value }))}
              placeholder={DEFAULT_ANKETA_INTRO_DESCRIPTION}
              rows={5}
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground">
              Несколько строк допустимо. Пусто → используется текст по умолчанию.
            </p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {saving ? "Сохраняем..." : "Сохранить текст"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Поля анкеты — переиспользуем PostDemoSettings */}
      <PostDemoSettings vacancyId={vacancyId} sections={["formFields"]} />

      {/* 3. Дозапрос данных — переиспользуем AutomationSettings */}
      <AutomationSettings
        vacancyId={vacancyId}
        descriptionJson={descriptionJson}
        sections={["enrichment"]}
        showGlobalSave={false}
      />
    </div>
  )
}
