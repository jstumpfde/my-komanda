"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { Vacancy, HiringGoal, CurrentProblem, VacancyFunction, Segment } from "@/lib/company-types"
import {
  HIRING_GOALS,
  CURRENT_PROBLEMS,
  FUNCTIONS,
  EXPERIENCE_OPTIONS,
  WORK_FORMATS,
  HIRING_URGENCIES,
  SEGMENTS,
} from "@/lib/company-types"

export interface StepVacancyProps {
  data: Partial<Vacancy>
  onChange: (data: Partial<Vacancy>) => void
}

// ─── Reusable sub-components ────────────────────────────────────────────────

function RadioGroup({
  label,
  options,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
  required?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-sm transition-colors",
              value === opt.value
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  required?: boolean
  hint?: string
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-sm transition-colors",
              value.includes(opt.value)
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      <Separator className="mt-2" />
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function StepVacancy({ data, onChange }: StepVacancyProps) {
  const update = <K extends keyof Vacancy>(field: K, value: Vacancy[K]) =>
    onChange({ ...data, [field]: value })

  const mainPainLength = data.main_pain?.length ?? 0

  return (
    <div className="space-y-8">

      {/* ── Позиция ── */}
      <div className="space-y-4">
        <SectionTitle>Позиция</SectionTitle>

        <div className="space-y-1.5">
          <Label htmlFor="position-title">
            Должность <span className="text-destructive">*</span>
          </Label>
          <Input
            id="position-title"
            placeholder="Менеджер по продажам"
            value={data.position_title ?? ""}
            onChange={(e) => update("position_title", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="headcount">
              Количество человек <span className="text-destructive">*</span>
            </Label>
            <Input
              id="headcount"
              type="number"
              placeholder="1"
              min={1}
              value={data.headcount ?? ""}
              onChange={(e) => update("headcount", parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-sales">План продаж/мес на человека</Label>
            <Input
              id="plan-sales"
              type="number"
              placeholder="10"
              min={0}
              value={data.plan_sales_per_month ?? ""}
              onChange={(e) => update("plan_sales_per_month", parseFloat(e.target.value) || undefined)}
            />
            <p className="text-xs text-muted-foreground">Необязательно</p>
          </div>
        </div>

        <RadioGroup
          label="Срочность найма"
          options={HIRING_URGENCIES}
          value={data.hiring_urgency}
          onChange={(v) => update("hiring_urgency", v as Vacancy["hiring_urgency"])}
        />
      </div>

      {/* ── Цели найма ── */}
      <div className="space-y-4">
        <SectionTitle>Цели найма</SectionTitle>

        <CheckboxGroup
          label="Зачем нанимаете"
          options={HIRING_GOALS}
          value={data.hiring_goals ?? []}
          onChange={(v) => update("hiring_goals", v as HiringGoal[])}
          required
          hint="Выберите один или несколько вариантов"
        />

        <div className="space-y-1.5">
          <Label htmlFor="main-goal">Главная цель одним предложением</Label>
          <Input
            id="main-goal"
            placeholder="Нанять 2 менеджеров для масштабирования входящего потока"
            value={data.main_goal ?? ""}
            onChange={(e) => update("main_goal", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Используется в демонстрации должности кандидату</p>
        </div>
      </div>

      {/* ── Текущие проблемы ── */}
      <div className="space-y-4">
        <SectionTitle>Текущие проблемы в продажах</SectionTitle>

        <CheckboxGroup
          label="Что сейчас не работает"
          options={CURRENT_PROBLEMS}
          value={data.current_problems ?? []}
          onChange={(v) => update("current_problems", v as CurrentProblem[])}
          hint="Необязательно, но помогает AI подобрать кандидата с нужным опытом"
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="main-pain">Главная боль / проблема</Label>
            <span className={cn("text-xs", mainPainLength > 280 ? "text-orange-500" : "text-muted-foreground")}>
              {mainPainLength}/300
            </span>
          </div>
          <Textarea
            id="main-pain"
            placeholder="Опишите главную сложность, с которой должен помочь новый сотрудник"
            value={data.main_pain ?? ""}
            onChange={(e) => {
              if (e.target.value.length <= 300) update("main_pain", e.target.value)
            }}
            rows={3}
            maxLength={300}
          />
        </div>
      </div>

      {/* ── Функционал ── */}
      <div className="space-y-4">
        <SectionTitle>Функционал</SectionTitle>

        <CheckboxGroup
          label="Основные задачи"
          options={FUNCTIONS}
          value={data.functions ?? []}
          onChange={(v) => update("functions", v as VacancyFunction[])}
          required
          hint="Выберите всё, чем будет заниматься сотрудник"
        />

        <div className="space-y-1.5">
          <Label htmlFor="core-function">Основная задача (80% времени)</Label>
          <Input
            id="core-function"
            placeholder="Холодный обзвон и квалификация лидов"
            value={data.core_function ?? ""}
            onChange={(e) => update("core_function", e.target.value)}
          />
        </div>
      </div>

      {/* ── Требования ── */}
      <div className="space-y-4">
        <SectionTitle>Требования к кандидату</SectionTitle>

        <RadioGroup
          label="Опыт в продажах"
          options={EXPERIENCE_OPTIONS}
          value={data.experience}
          onChange={(v) => update("experience", v as Vacancy["experience"])}
          required
        />

        <CheckboxGroup
          label="Опыт работы с сегментами"
          options={[...SEGMENTS.map((s) => ({ value: s, label: s })), { value: "any", label: "Любой" }]}
          value={data.segment_experience ?? []}
          onChange={(v) => update("segment_experience", v as Segment[])}
        />

        <div className="space-y-1.5">
          <Label htmlFor="mandatory">Обязательные критерии</Label>
          <Textarea
            id="mandatory"
            placeholder="Опыт в B2B продажах, знание CRM, наличие клиентской базы..."
            value={data.mandatory_criteria ?? ""}
            onChange={(e) => update("mandatory_criteria", e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dealbreakers">Что неприемлемо (dealbreakers)</Label>
          <Textarea
            id="dealbreakers"
            placeholder="Опыт только в рознице, без опыта активных продаж..."
            value={data.dealbreakers ?? ""}
            onChange={(e) => update("dealbreakers", e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">Используется для автоматической фильтрации кандидатов</p>
        </div>
      </div>

      {/* ── Условия ── */}
      <div className="space-y-4">
        <SectionTitle>Условия работы</SectionTitle>

        <RadioGroup
          label="Формат работы"
          options={WORK_FORMATS}
          value={data.work_format}
          onChange={(v) => update("work_format", v as Vacancy["work_format"])}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="salary-fix">
              Оклад, ₽/мес <span className="text-destructive">*</span>
            </Label>
            <Input
              id="salary-fix"
              type="number"
              placeholder="80 000"
              min={1}
              value={data.salary_fix || ""}
              onChange={(e) => update("salary_fix", parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bonus-desc">Бонус / KPI</Label>
            <Input
              id="bonus-desc"
              placeholder="% от выручки, KPI квартала..."
              value={data.bonus_description ?? ""}
              onChange={(e) => update("bonus_description", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="avg-income">Средний доход, ₽/мес</Label>
            <Input
              id="avg-income"
              type="number"
              placeholder="120 000"
              min={0}
              value={data.avg_income ?? ""}
              onChange={(e) => update("avg_income", parseFloat(e.target.value) || undefined)}
            />
            <p className="text-xs text-muted-foreground">Оклад + бонус при выполнении плана</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max-income">Потолок дохода, ₽/мес</Label>
            <Input
              id="max-income"
              type="number"
              placeholder="200 000"
              min={0}
              value={data.max_income ?? ""}
              onChange={(e) => update("max_income", parseFloat(e.target.value) || undefined)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="extra-conditions">Дополнительные условия</Label>
          <Textarea
            id="extra-conditions"
            placeholder="ДМС, корпоративный автомобиль, обучение за счёт компании..."
            value={data.extra_conditions ?? ""}
            onChange={(e) => update("extra_conditions", e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">Необязательно</p>
        </div>
      </div>

    </div>
  )
}
