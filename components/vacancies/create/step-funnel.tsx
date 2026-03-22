"use client"

import { Info, TrendingUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Vacancy } from "@/lib/company-types"
import { PAYBACK_PERIODS } from "@/lib/company-types"

export interface StepFunnelProps {
  data: Partial<Vacancy>
  onChange: (data: Partial<Vacancy>) => void
  salaryFix?: number
}

function RadioGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
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
    </div>
  )
}

function NumericField({
  id,
  label,
  placeholder,
  value,
  onChange,
  hint,
  suffix,
  min,
  max,
}: {
  id: string
  label: string
  placeholder: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  hint?: string
  suffix?: string
  min?: number
  max?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          placeholder={placeholder}
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            onChange(isNaN(v) ? undefined : v)
          }}
          className={suffix ? "pr-10" : ""}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function StepFunnel({ data, onChange, salaryFix }: StepFunnelProps) {
  const update = <K extends keyof Vacancy>(field: K, value: Vacancy[K]) =>
    onChange({ ...data, [field]: value })

  // Compute employee ROMI
  const salary = salaryFix ?? 0
  const expectedRevenue = data.expected_revenue_per_employee ?? 0
  const investmentInHiring = data.hiring_investment ?? 0
  const denominator = salary + investmentInHiring
  const employeeRomi = denominator > 0 && expectedRevenue > 0
    ? (expectedRevenue / denominator).toFixed(1)
    : null

  return (
    <TooltipProvider>
      <div className="space-y-8">

        {/* Info banner */}
        <div className="flex gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Необязательный шаг</p>
            <p className="text-xs text-blue-600 dark:text-blue-400/80">
              Данные воронки и экономики не обязательны для публикации, но значительно повышают точность AI-скоринга кандидатов
            </p>
          </div>
        </div>

        {/* ── Воронка продаж ── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Воронка продаж</h3>
            <Separator className="mt-2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumericField
              id="leads-month"
              label="Лидов в месяц"
              placeholder="100"
              value={data.leads_per_month}
              onChange={(v) => update("leads_per_month", v)}
              hint="Сколько входящих заявок или холодных контактов в месяц"
              min={0}
            />
            <NumericField
              id="conv-meeting"
              label="Конверсия в встречу, %"
              placeholder="20"
              value={data.conversion_to_meeting_pct}
              onChange={(v) => update("conversion_to_meeting_pct", v)}
              suffix="%"
              min={0}
              max={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumericField
              id="conv-deal"
              label="Конверсия в сделку, %"
              placeholder="15"
              value={data.conversion_to_deal_pct}
              onChange={(v) => update("conversion_to_deal_pct", v)}
              suffix="%"
              min={0}
              max={100}
            />
            <NumericField
              id="sales-month"
              label="Продаж в месяц"
              placeholder="15"
              value={data.sales_per_month}
              onChange={(v) => update("sales_per_month", v)}
              hint="Сколько сделок закрывает менеджер в месяц"
              min={0}
            />
          </div>

          <NumericField
            id="revenue-manager"
            label="Выручка с одного менеджера, ₽/мес"
            placeholder="500 000"
            value={data.revenue_per_manager}
            onChange={(v) => update("revenue_per_manager", v)}
            hint="Текущий средний показатель"
            min={0}
          />
        </div>

        {/* ── Экономика найма ── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Экономика найма</h3>
            <Separator className="mt-2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumericField
              id="expected-revenue"
              label="Должен приносить, ₽/мес"
              placeholder="1 000 000"
              value={data.expected_revenue_per_employee}
              onChange={(v) => update("expected_revenue_per_employee", v)}
              hint="Ожидаемая выручка от одного сотрудника"
              min={0}
            />
            <NumericField
              id="hiring-investment"
              label="Инвестиция в найм, ₽"
              placeholder="50 000"
              value={data.hiring_investment}
              onChange={(v) => update("hiring_investment", v)}
              hint="Бюджет на подбор одного человека"
              min={0}
            />
          </div>

          <RadioGroup
            label="Срок окупаемости сотрудника"
            options={PAYBACK_PERIODS}
            value={data.payback_period}
            onChange={(v) => update("payback_period", v as Vacancy["payback_period"])}
          />

          {/* Computed ROMI */}
          {employeeRomi !== null && (
            <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">ROMI сотрудника</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Выручка сотрудника / (Оклад + Инвестиция в найм). Показывает, сколько рублей выручки
                      приходится на каждый рубль затрат на сотрудника.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-foreground">{employeeRomi}×</div>
              </div>
              <p className="text-xs text-muted-foreground max-w-[180px]">
                Вычисляется автоматически. Рекомендуемое значение: 5–10×
              </p>
            </div>
          )}
        </div>

      </div>
    </TooltipProvider>
  )
}
