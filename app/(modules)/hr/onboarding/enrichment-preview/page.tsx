"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  Paperclip,
} from "lucide-react"
import {
  INDUSTRIES,
  REVENUE_RANGES,
  SALES_TYPES,
  DEAL_CYCLES,
  SEGMENTS,
  CRM_STATUSES,
  YES_PARTIAL_NO,
  SALES_MANAGER_TYPES,
  type Industry,
  type RevenueRange,
  type SalesType,
  type DealCycle,
  type Segment,
} from "@/lib/company-types"
import { saveCompany, generateId } from "@/lib/company-storage"
import type { Company } from "@/lib/company-types"

// ─── Mock enrichment data ─────────────────────────────────────────────────────

interface EnrichmentDraft {
  // Block 1
  name: string
  city: string
  founded_year: number
  industry: Industry
  revenue_range: RevenueRange
  // Block 2
  product_name: string
  product_description: string
  avg_check: string
  sales_type: SalesType
  deal_cycle: DealCycle
  segments: Segment[]
  // Block 3
  crm_status: "active" | "exists_unused" | "none"
  crm_name: string
  sales_scripts: "yes" | "partial" | "no"
  training_system: "yes" | "partial" | "no"
  sales_manager_type: "rop" | "owner" | "none"
}

const MOCK_DRAFT: EnrichmentDraft = {
  name: "ГК Орлинк",
  city: "Москва",
  founded_year: 2009,
  industry: "Строительство",
  revenue_range: "5M-15M",
  product_name: "Металлоконструкции",
  product_description:
    "Проектирование и монтаж металлоконструкций для промышленных объектов",
  avg_check: "",
  sales_type: "cold",
  deal_cycle: "long_1_6m",
  segments: ["B2B", "B2G"],
  crm_status: "none",
  crm_name: "",
  sales_scripts: "no",
  training_system: "no",
  sales_manager_type: "owner",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yearsFromFounded(year: number) {
  return new Date().getFullYear() - year
}

function revenueLabel(val: RevenueRange) {
  return REVENUE_RANGES.find((r) => r.value === val)?.label ?? val
}

function crmStatusLabel(val: string) {
  return CRM_STATUSES.find((c) => c.value === val)?.label ?? val
}

function salesScriptsLabel(val: string) {
  return YES_PARTIAL_NO.find((y) => y.value === val)?.label ?? val
}

// ─── Chip selector ────────────────────────────────────────────────────────────

interface ChipSelectorProps<T extends string> {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}

function ChipSelector<T extends string>({ options, value, onChange }: ChipSelectorProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-full border transition-all",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Multi-chip selector ──────────────────────────────────────────────────────

interface MultiChipProps<T extends string> {
  options: readonly T[]
  value: T[]
  onChange: (v: T[]) => void
}

function MultiChip<T extends string>({ options, value, onChange }: MultiChipProps<T>) {
  const toggle = (opt: T) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-full border transition-all",
            value.includes(opt)
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ─── Collapsible block ────────────────────────────────────────────────────────

interface BlockProps {
  title: string
  summary: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

function CollapsibleBlock({ title, summary, expanded, onToggle, children }: BlockProps) {
  return (
    <Card
      className={cn(
        "border transition-all",
        expanded ? "border-primary/30" : "border-border"
      )}
    >
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
              {title}
            </p>
            {!expanded && (
              <p className="text-sm text-foreground leading-snug">{summary}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium transition-colors flex-shrink-0 mt-0.5",
              expanded
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Свернуть
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                Изменить
              </>
            )}
          </button>
        </div>

        {/* Expanded form */}
        {expanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EnrichmentPreviewPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<EnrichmentDraft>(MOCK_DRAFT)
  const [expandedBlock, setExpandedBlock] = useState<1 | 2 | 3 | null>(null)

  const toggleBlock = (block: 1 | 2 | 3) => {
    setExpandedBlock(expandedBlock === block ? null : block)
  }

  const update = (partial: Partial<EnrichmentDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }))
  }

  // Summaries
  const summary1 = [
    draft.name,
    draft.city,
    `${yearsFromFounded(draft.founded_year)} лет`,
    revenueLabel(draft.revenue_range) + "/мес",
  ]
    .filter(Boolean)
    .join(" • ")

  const summary2 = [
    draft.product_name,
    draft.segments.join(", "),
    draft.avg_check ? `чек — ${draft.avg_check}` : "чек — укажите",
  ]
    .filter(Boolean)
    .join(" • ")

  const summary3 = `CRM: ${crmStatusLabel(draft.crm_status)} • Скрипты: ${salesScriptsLabel(draft.sales_scripts)}`

  // Save and redirect
  const handleSave = () => {
    const company: Company = {
      id: generateId("comp"),
      name: draft.name,
      industry: draft.industry,
      city: draft.city,
      founded_year: draft.founded_year,
      revenue_range: draft.revenue_range,
      crm_status: draft.crm_status,
      crm_name: draft.crm_name || undefined,
      sales_scripts: draft.sales_scripts,
      training_system: draft.training_system,
      sales_manager_type: draft.sales_manager_type,
      is_multi_product: false,
    }
    saveCompany(company)
    router.push("/vacancies/create")
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.push("/onboarding/smart-input")}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              М
            </div>
            <span className="text-sm font-semibold text-foreground">Company24</span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-start justify-center p-4 py-10">
        <div className="max-w-2xl w-full space-y-6">

          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <h1 className="text-2xl font-bold text-foreground">Мы подготовили черновик</h1>
            </div>
            <p className="text-muted-foreground">
              Отредактируйте под себя — нажмите «Изменить» в любом разделе
            </p>
          </div>

          {/* ── Block 1: Основные данные ── */}
          <CollapsibleBlock
            title="Основные данные"
            summary={summary1}
            expanded={expandedBlock === 1}
            onToggle={() => toggleBlock(1)}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Название компании</Label>
              <Input
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="ООО Ромашка"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Отрасль</Label>
              <Select
                value={draft.industry}
                onValueChange={(v) => update({ industry: v as Industry })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Город</Label>
                <Input
                  value={draft.city}
                  onChange={(e) => update({ city: e.target.value })}
                  placeholder="Москва"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Год основания</Label>
                <Input
                  type="number"
                  value={draft.founded_year}
                  onChange={(e) =>
                    update({ founded_year: parseInt(e.target.value) || draft.founded_year })
                  }
                  placeholder="2010"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Оборот</Label>
              <Select
                value={draft.revenue_range}
                onValueChange={(v) => update({ revenue_range: v as RevenueRange })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CollapsibleBlock>

          {/* ── Block 2: Продукт и продажи ── */}
          <CollapsibleBlock
            title="Продукт и продажи"
            summary={summary2}
            expanded={expandedBlock === 2}
            onToggle={() => toggleBlock(2)}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Продукт / услуга</Label>
              <Input
                value={draft.product_name}
                onChange={(e) => update({ product_name: e.target.value })}
                placeholder="Название продукта"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Описание</Label>
              <Textarea
                value={draft.product_description}
                onChange={(e) => update({ product_description: e.target.value })}
                rows={3}
                className="resize-none text-sm"
                placeholder="Что продаёт компания..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Средний чек</Label>
              <Input
                value={draft.avg_check}
                onChange={(e) => update({ avg_check: e.target.value })}
                placeholder="например, 500 000 ₽"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Тип продаж</Label>
              <ChipSelector
                options={SALES_TYPES}
                value={draft.sales_type}
                onChange={(v) => update({ sales_type: v as SalesType })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Цикл сделки</Label>
              <ChipSelector
                options={DEAL_CYCLES}
                value={draft.deal_cycle}
                onChange={(v) => update({ deal_cycle: v as DealCycle })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Сегменты клиентов</Label>
              <MultiChip
                options={SEGMENTS}
                value={draft.segments}
                onChange={(v) => update({ segments: v as Segment[] })}
              />
            </div>
          </CollapsibleBlock>

          {/* ── Block 3: Система внутри ── */}
          <CollapsibleBlock
            title="Система внутри"
            summary={summary3}
            expanded={expandedBlock === 3}
            onToggle={() => toggleBlock(3)}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">CRM</Label>
              <ChipSelector
                options={CRM_STATUSES}
                value={draft.crm_status}
                onChange={(v) =>
                  update({ crm_status: v as "active" | "exists_unused" | "none" })
                }
              />
            </div>
            {draft.crm_status !== "none" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Название CRM</Label>
                <Input
                  value={draft.crm_name}
                  onChange={(e) => update({ crm_name: e.target.value })}
                  placeholder="Bitrix24, amoCRM, другая..."
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Скрипты продаж</Label>
              <ChipSelector
                options={YES_PARTIAL_NO}
                value={draft.sales_scripts}
                onChange={(v) =>
                  update({ sales_scripts: v as "yes" | "partial" | "no" })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Система обучения</Label>
              <ChipSelector
                options={YES_PARTIAL_NO}
                value={draft.training_system}
                onChange={(v) =>
                  update({ training_system: v as "yes" | "partial" | "no" })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Руководитель продаж</Label>
              <ChipSelector
                options={SALES_MANAGER_TYPES}
                value={draft.sales_manager_type}
                onChange={(v) =>
                  update({ sales_manager_type: v as "rop" | "owner" | "none" })
                }
              />
            </div>
          </CollapsibleBlock>

          {/* Source attribution */}
          <p className="text-xs text-muted-foreground text-center">
            Откуда данные: реестр юрлиц, сайт компании
          </p>

          {/* Clarify with file */}
          <div className="text-center">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Paperclip className="w-3 h-3" />
              Хотите уточнить? Загрузите КП или прайс
            </button>
          </div>

          {/* CTA buttons */}
          <div className="space-y-3 pt-2">
            <Button className="w-full h-12 gap-2 font-semibold" onClick={handleSave}>
              <Save className="w-4 h-4" />
              Всё верно — сохранить
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => router.push("/vacancies/create")}
            >
              Хочу заполнить заново вручную
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
