"use client"

import { Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Company } from "@/lib/company-types"
import {
  INDUSTRIES,
  REVENUE_RANGES,
  CRM_STATUSES,
  YES_PARTIAL_NO,
  SALES_MANAGER_TYPES,
} from "@/lib/company-types"

export interface StepCompanyProps {
  data: Partial<Company>
  onChange: (data: Partial<Company>) => void
}

function RadioGroup({
  label,
  options,
  value,
  onChange,
  required,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
  required?: boolean
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
    </div>
  )
}

function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      <Separator className="mt-2" />
    </div>
  )
}

export function StepCompany({ data, onChange }: StepCompanyProps) {
  const update = <K extends keyof Company>(field: K, value: Company[K]) =>
    onChange({ ...data, [field]: value })

  const currentYear = new Date().getFullYear()
  const yearsInBusiness =
    data.founded_year && data.founded_year >= 1900 && data.founded_year <= currentYear
      ? currentYear - data.founded_year
      : null

  const showCrmName = data.crm_status === "active" || data.crm_status === "exists_unused"

  return (
    <TooltipProvider>
      <div className="space-y-8">

        {/* ── Основная информация ── */}
        <div className="space-y-4">
          <SectionTitle>Основная информация</SectionTitle>

          <FieldRow>
            <Label htmlFor="company-name">
              Название компании <span className="text-destructive">*</span>
            </Label>
            <Input
              id="company-name"
              placeholder="ООО «Альфа Трейдинг»"
              value={data.name ?? ""}
              onChange={(e) => update("name", e.target.value)}
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow>
              <Label htmlFor="industry">
                Отрасль <span className="text-destructive">*</span>
              </Label>
              <Select value={data.industry ?? ""} onValueChange={(v) => update("industry", v as Company["industry"])}>
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Выберите отрасль" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data.industry === "Другое" && (
                <Input
                  className="mt-2"
                  placeholder="Укажите отрасль"
                  value={data.industry_custom ?? ""}
                  onChange={(e) => update("industry_custom", e.target.value)}
                />
              )}
            </FieldRow>

            <FieldRow>
              <Label htmlFor="city">
                Город <span className="text-destructive">*</span>
              </Label>
              <Input
                id="city"
                placeholder="Москва"
                value={data.city ?? ""}
                onChange={(e) => update("city", e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow>
              <Label htmlFor="founded-year">
                Год основания <span className="text-destructive">*</span>
              </Label>
              <Input
                id="founded-year"
                type="number"
                placeholder="2010"
                min={1900}
                max={currentYear}
                value={data.founded_year ?? ""}
                onChange={(e) => update("founded_year", parseInt(e.target.value) || 0)}
              />
            </FieldRow>

            <FieldRow>
              <div className="flex items-center gap-1.5">
                <Label>Лет на рынке</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Вычисляется автоматически из года основания</TooltipContent>
                </Tooltip>
              </div>
              <div className={cn(
                "h-10 px-3 py-2 rounded-md border border-border bg-muted/40 text-sm flex items-center",
                yearsInBusiness === null ? "text-muted-foreground" : "text-foreground font-medium"
              )}>
                {yearsInBusiness !== null ? `${yearsInBusiness} лет` : "—"}
              </div>
            </FieldRow>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow>
              <Label htmlFor="revenue-range">Оборот в месяц</Label>
              <Select value={data.revenue_range ?? ""} onValueChange={(v) => update("revenue_range", v as Company["revenue_range"])}>
                <SelectTrigger id="revenue-range">
                  <SelectValue placeholder="Выберите диапазон" />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Влияет на AI-скоринг кандидатов</p>
            </FieldRow>

            <FieldRow>
              <Label htmlFor="website">Сайт компании</Label>
              <Input
                id="website"
                placeholder="https://company.ru"
                value={data.website ?? ""}
                onChange={(e) => update("website", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Необязательно</p>
            </FieldRow>
          </div>
        </div>

        {/* ── CRM и системы ── */}
        <div className="space-y-4">
          <SectionTitle>CRM и системы продаж</SectionTitle>

          <RadioGroup
            label="CRM-система"
            options={CRM_STATUSES}
            value={data.crm_status}
            onChange={(v) => update("crm_status", v as Company["crm_status"])}
          />

          <div className={cn(
            "overflow-hidden transition-all duration-200",
            showCrmName ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
          )}>
            <FieldRow className="pt-1">
              <Label htmlFor="crm-name">Какая CRM</Label>
              <Input
                id="crm-name"
                placeholder="amoCRM, Bitrix24, 1С CRM..."
                value={data.crm_name ?? ""}
                onChange={(e) => update("crm_name", e.target.value)}
              />
            </FieldRow>
          </div>

          <RadioGroup
            label="Скрипты продаж"
            options={YES_PARTIAL_NO}
            value={data.sales_scripts}
            onChange={(v) => update("sales_scripts", v as Company["sales_scripts"])}
          />

          <RadioGroup
            label="Система обучения новых сотрудников"
            options={YES_PARTIAL_NO}
            value={data.training_system}
            onChange={(v) => update("training_system", v as Company["training_system"])}
          />

          <FieldRow>
            <Label htmlFor="trainer">Кто обучает новичков</Label>
            <Input
              id="trainer"
              placeholder="РОП, старший менеджер, внешний тренер..."
              value={data.trainer ?? ""}
              onChange={(e) => update("trainer", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Необязательно</p>
          </FieldRow>

          <RadioGroup
            label="Кто управляет продажами"
            options={SALES_MANAGER_TYPES}
            value={data.sales_manager_type}
            onChange={(v) => update("sales_manager_type", v as Company["sales_manager_type"])}
          />
        </div>

        {/* ── Структура продуктов ── */}
        <div className="space-y-4">
          <SectionTitle>Структура продуктов</SectionTitle>

          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Несколько направлений / продуктов</div>
              <div className="text-xs text-muted-foreground">
                Включите, если компания продаёт несколько разных продуктов или работает в разных сегментах
              </div>
            </div>
            <Switch
              checked={data.is_multi_product ?? false}
              onCheckedChange={(v) => update("is_multi_product", v)}
            />
          </div>
        </div>

      </div>
    </TooltipProvider>
  )
}
