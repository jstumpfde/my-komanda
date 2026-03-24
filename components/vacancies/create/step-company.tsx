"use client"

import { useState } from "react"
import { Search, Loader2, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
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
import { toast } from "sonner"
import type { Company } from "@/lib/company-types"
import {
  INDUSTRIES,
  REVENUE_RANGES,
  CRM_STATUSES,
  YES_PARTIAL_NO,
  SALES_MANAGER_TYPES,
} from "@/lib/company-types"
import { fetchCompanyByInn } from "@/lib/company-storage"

// ─── DaData types ─────────────────────────────────────────────────────────────

interface DadataSuggestion {
  value: string
  data?: {
    inn?: string
    kpp?: string
    name?: {
      full_with_opf?: string
      full?: string
      short_with_opf?: string
    }
    address?: {
      value?: string
      data?: {
        city?: string
        settlement?: string
        region_with_type?: string
      }
    }
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface StepCompanyProps {
  data: Partial<Company>
  onChange: (data: Partial<Company>) => void
  /** True while company data is being fetched from API on mount */
  isLoading?: boolean
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* INN search placeholder */}
      <div className="h-24 rounded-xl bg-muted/50" />
      {/* Section */}
      <div className="space-y-4">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="h-10 bg-muted rounded-md" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-muted rounded-md" />
          <div className="h-10 bg-muted rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-muted rounded-md" />
          <div className="h-10 bg-muted rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-muted rounded-md" />
          <div className="h-10 bg-muted rounded-md" />
        </div>
      </div>
      {/* Section 2 */}
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StepCompany({ data, onChange, isLoading }: StepCompanyProps) {
  const [inn, setInn] = useState("")
  const [innSearching, setInnSearching] = useState(false)

  const update = <K extends keyof Company>(field: K, value: Company[K]) =>
    onChange({ ...data, [field]: value })

  const currentYear = new Date().getFullYear()
  const yearsInBusiness =
    data.founded_year && data.founded_year >= 1900 && data.founded_year <= currentYear
      ? currentYear - data.founded_year
      : null

  const showCrmName = data.crm_status === "active" || data.crm_status === "exists_unused"

  // ── INN search ────────────────────────────────────────────────

  const handleInnSearch = async () => {
    const digits = inn.replace(/\D/g, "")
    if (digits.length !== 10 && digits.length !== 12) {
      toast.error("ИНН должен содержать 10 цифр (ООО/АО) или 12 цифр (ИП)")
      return
    }
    setInnSearching(true)
    try {
      const raw = await fetchCompanyByInn(digits) as {
        data?: { suggestions?: DadataSuggestion[] }
      }
      const suggestions = raw?.data?.suggestions ?? []
      const s = suggestions[0]
      if (!s) {
        toast.error("Компания не найдена по ИНН")
        return
      }
      const fullName =
        s.data?.name?.full_with_opf ||
        s.data?.name?.full ||
        s.data?.name?.short_with_opf ||
        ""
      const city =
        s.data?.address?.data?.city ||
        s.data?.address?.data?.settlement ||
        s.data?.address?.data?.region_with_type ||
        ""

      onChange({
        ...data,
        name: fullName || data.name,
        city: city || data.city,
      })
      if (fullName) toast.success("Данные компании загружены из DaData")
    } catch {
      toast.error("Не удалось загрузить данные из DaData")
    } finally {
      setInnSearching(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingSkeleton />
  }

  return (
    <TooltipProvider>
      <div className="space-y-8">

        {/* ── Быстрое заполнение по ИНН ── */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Быстрое заполнение по ИНН</span>
            <span className="text-xs text-muted-foreground ml-auto">необязательно</span>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="7707083893 (ООО/АО) или 123456789012 (ИП)"
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
              className="font-mono text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handleInnSearch() }}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={handleInnSearch}
              disabled={innSearching}
            >
              {innSearching
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Автоматически заполнит название компании и город по данным ФНС
          </p>
        </div>

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
