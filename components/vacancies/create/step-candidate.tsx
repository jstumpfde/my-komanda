"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { Vacancy } from "@/lib/company-types"

export interface StepCandidateProps {
  data: Partial<Vacancy>
  onChange: (data: Partial<Vacancy>) => void
  completionPct: number
  onPublish: () => void
  onSaveDraft: () => void
  isPublishing: boolean
}

function CompletionBadge({ pct }: { pct: number }) {
  if (pct >= 80) {
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 font-medium">
        ✓ Отлично! Все данные для точного подбора
      </Badge>
    )
  }
  if (pct >= 50) {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 font-medium">
        Минимум для публикации. AI-скоринг будет неточным
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="font-medium">
      Недостаточно данных для публикации
    </Badge>
  )
}

export function StepCandidate({
  data,
  onChange,
  completionPct,
  onPublish,
  onSaveDraft,
  isPublishing,
}: StepCandidateProps) {
  const update = <K extends keyof Vacancy>(field: K, value: Vacancy[K]) =>
    onChange({ ...data, [field]: value })

  const idealCandidateLength = data.ideal_candidate?.length ?? 0
  const canPublish = completionPct >= 50

  return (
    <div className="space-y-8">

      {/* ── Портрет кандидата ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Портрет идеального кандидата</h3>
          <Separator className="mt-2" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ideal-candidate">Описание идеального сотрудника</Label>
            <span className={cn(
              "text-xs",
              idealCandidateLength > 450 ? "text-orange-500" : "text-muted-foreground"
            )}>
              {idealCandidateLength}/500
            </span>
          </div>
          <Textarea
            id="ideal-candidate"
            placeholder="Опишите, каким вы видите идеального кандидата: опыт, личные качества, подход к работе..."
            value={data.ideal_candidate ?? ""}
            onChange={(e) => {
              if (e.target.value.length <= 500) update("ideal_candidate", e.target.value)
            }}
            rows={5}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Используется для AI-скоринга и демонстрации должности кандидату
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="first-month">Что должен уметь в первый месяц</Label>
          <Textarea
            id="first-month"
            placeholder="Выйти на самостоятельный холодный обзвон, закрыть первую сделку, освоить CRM..."
            value={data.first_month_expectations ?? ""}
            onChange={(e) => update("first_month_expectations", e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Помогает кандидату понять ожидания с первого дня
          </p>
        </div>
      </div>

      {/* ── Итог и публикация ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Готовность к публикации</h3>
          <Separator className="mt-2" />
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Заполнено анкеты</span>
            <span className={cn(
              "text-sm font-semibold",
              completionPct >= 80 ? "text-green-600" :
              completionPct >= 50 ? "text-yellow-600" : "text-destructive"
            )}>
              {completionPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                completionPct >= 80 ? "bg-green-500" :
                completionPct >= 50 ? "bg-yellow-500" : "bg-destructive"
              )}
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <CompletionBadge pct={completionPct} />
        </div>

        {!canPublish && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            Заполните обязательные поля на шагах 1–3 для публикации вакансии.
            Минимум: название компании, отрасль, город, год основания, название продукта,
            должность, цели найма, функционал, оклад, формат работы.
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            size="lg"
            className="flex-1 gap-2"
            onClick={onPublish}
            disabled={!canPublish || isPublishing}
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Публикуем вакансию...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Опубликовать вакансию
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={onSaveDraft}
            disabled={isPublishing}
          >
            Сохранить черновик
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Черновик автоматически сохраняется при переходе между шагами
        </p>
      </div>

    </div>
  )
}
