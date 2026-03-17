"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Loader2, Rocket, MapPin, Briefcase, DollarSign, Users, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import type { VacancyDraft } from "@/lib/vacancy-types"
import { FORMAT_LABELS, EMPLOYMENT_LABELS } from "@/lib/vacancy-types"
import { addVacancyToCategory } from "@/lib/vacancy-storage"

interface Props {
  draft: VacancyDraft
}

export function StepPublish({ draft }: Props) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)

  const handlePublish = () => {
    setPublishing(true)
    const vacId = `v-${Date.now()}`
    setTimeout(() => {
      // Add to sidebar
      addVacancyToCategory(draft.sidebarSection || "Продажи", vacId, draft.title)
      setPublishing(false)
      setPublished(true)
      toast.success("Вакансия опубликована!", {
        description: `«${draft.title}» размещена на hh.ru`,
      })
      setTimeout(() => {
        router.push(`/vacancies/${vacId}`)
      }, 2000)
    }, 2500)
  }

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Вакансия опубликована!</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          «{draft.title}» успешно размещена на hh.ru. Воронка найма создана — перенаправляем на страницу вакансии...
        </p>
        <div className="flex items-center gap-2 mt-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Переход на страницу вакансии...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Публикация</h2>
        <p className="text-sm text-muted-foreground">Проверьте данные перед публикацией на hh.ru</p>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">{draft.title || "Без названия"}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" />
                {draft.city || "Не указан"}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Briefcase className="w-3 h-3" />
                {FORMAT_LABELS[draft.format] || "Не указан"}
              </Badge>
              <Badge variant="secondary">
                {EMPLOYMENT_LABELS[draft.employment] || "Не указан"}
              </Badge>
              <Badge variant="outline">
                {draft.category || "Без категории"}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {draft.salaryMin.toLocaleString("ru-RU")} – {draft.salaryMax.toLocaleString("ru-RU")} ₽
            </span>
          </div>

          {draft.idealSkills.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Ключевые навыки</p>
              <div className="flex flex-wrap gap-1.5">
                {draft.idealSkills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Опыт кандидата</p>
            <p className="text-sm text-foreground">{draft.idealExperience || "Не указан"}</p>
          </div>

          {draft.generatedText && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Текст вакансии</p>
              <p className="text-sm text-foreground line-clamp-3">{draft.generatedText.slice(0, 200)}...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish actions */}
      <div className="space-y-3">
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={handlePublish}
          disabled={publishing}
        >
          {publishing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Публикуем на hh.ru...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              Опубликовать на hh.ru
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          После публикации будет создана воронка для этой вакансии
        </p>
      </div>
    </div>
  )
}
