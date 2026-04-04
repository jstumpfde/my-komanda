"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Sparkles, Save, Loader2, DollarSign, Building2, TrendingUp } from "lucide-react"
import { toast } from "sonner"

interface VacancyAiTextProps {
  vacancyId: string
  descriptionJson?: unknown
}

type Accent = "income" | "company" | "growth"

interface GeneratedVariant {
  accent: Accent
  text: string
}

const ACCENTS: { id: Accent; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "income", label: "Доход", icon: <DollarSign className="w-3.5 h-3.5" />, description: "Акцент на зарплату и бонусы" },
  { id: "company", label: "Компания", icon: <Building2 className="w-3.5 h-3.5" />, description: "Акцент на стабильность и команду" },
  { id: "growth", label: "Рост", icon: <TrendingUp className="w-3.5 h-3.5" />, description: "Акцент на карьеру и обучение" },
]

export function VacancyAiText({ vacancyId, descriptionJson }: VacancyAiTextProps) {
  const desc = (descriptionJson as Record<string, unknown>) || {}
  const saved = (desc.generatedText as Record<string, string>) || {}

  const [variants, setVariants] = useState<Record<Accent, string>>({
    income: saved.income || "",
    company: saved.company || "",
    growth: saved.growth || "",
  })
  const [activeTab, setActiveTab] = useState<Accent>("income")
  const [generating, setGenerating] = useState<Accent | "all" | null>(null)
  const [saving, setSaving] = useState(false)

  const generate = useCallback(async (accent: Accent) => {
    setGenerating(accent)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/generate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ошибка сервера" }))
        throw new Error(err.error || "Ошибка генерации")
      }
      const data = await res.json()
      setVariants(prev => ({ ...prev, [accent]: data.text }))
      setActiveTab(accent)
      toast.success(`Вариант «${ACCENTS.find(a => a.id === accent)?.label}» сгенерирован`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка генерации")
    } finally {
      setGenerating(null)
    }
  }, [vacancyId])

  const generateAll = useCallback(async () => {
    setGenerating("all")
    try {
      for (const accent of ACCENTS) {
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/generate-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accent: accent.id }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Ошибка сервера" }))
          throw new Error(err.error || "Ошибка генерации")
        }
        const data = await res.json()
        setVariants(prev => ({ ...prev, [accent.id]: data.text }))
      }
      toast.success("Все 3 варианта сгенерированы")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка генерации")
    } finally {
      setGenerating(null)
    }
  }, [vacancyId])

  const saveVariants = useCallback(async () => {
    setSaving(true)
    try {
      const existing = (descriptionJson as Record<string, unknown>) || {}
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description_json: { ...existing, generatedText: variants },
        }),
      })
      if (!res.ok) throw new Error("Ошибка сохранения")
      toast.success("Тексты вакансии сохранены")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }, [vacancyId, variants, descriptionJson])

  const hasAnyText = Object.values(variants).some(v => v.trim().length > 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Текст вакансии
            <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-200">AI</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={generating !== null}
              onClick={generateAll}
            >
              {generating === "all" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Сгенерировать все 3
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          AI сгенерирует 3 варианта текста с разными акцентами. Вы можете редактировать каждый вариант.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Accent)}>
          <TabsList className="grid grid-cols-3 mb-3">
            {ACCENTS.map((a) => (
              <TabsTrigger key={a.id} value={a.id} className="gap-1.5 text-xs">
                {a.icon}
                {a.label}
                {variants[a.id] && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {ACCENTS.map((a) => (
            <TabsContent key={a.id} value={a.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{a.description}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  disabled={generating !== null}
                  onClick={() => generate(a.id)}
                >
                  {generating === a.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {variants[a.id] ? "Перегенерировать" : "Сгенерировать"}
                </Button>
              </div>

              {variants[a.id] ? (
                <Textarea
                  value={variants[a.id]}
                  onChange={(e) => setVariants(prev => ({ ...prev, [a.id]: e.target.value }))}
                  className="min-h-[240px] text-sm leading-relaxed resize-y"
                  placeholder="Текст вакансии появится здесь..."
                />
              ) : (
                <div className={cn(
                  "flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center",
                  generating === a.id || generating === "all" ? "bg-violet-500/5" : "bg-muted/30"
                )}>
                  {generating === a.id || generating === "all" ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-violet-500 mb-2" />
                      <p className="text-sm text-muted-foreground">Генерируем текст...</p>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Нажмите «Сгенерировать», чтобы создать вариант</p>
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        {hasAnyText && (
          <div className="flex justify-end mt-4">
            <Button size="sm" className="gap-1.5 h-8 text-xs" disabled={saving} onClick={saveVariants}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
