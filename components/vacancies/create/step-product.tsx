"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { CompanyProduct, Segment } from "@/lib/company-types"
import { SALES_TYPES, DEAL_CYCLES, SEGMENTS } from "@/lib/company-types"

export interface StepProductProps {
  data: Partial<CompanyProduct>
  onChange: (data: Partial<CompanyProduct>) => void
  isMultiProduct: boolean
  companyId?: string
  selectedProductId?: string
  onSelectProduct: (productId: string | undefined) => void
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

function SegmentCheckboxes({
  value,
  onChange,
}: {
  value: Segment[]
  onChange: (v: Segment[]) => void
}) {
  const toggle = (seg: Segment) => {
    onChange(
      value.includes(seg) ? value.filter((s) => s !== seg) : [...value, seg]
    )
  }
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        Сегменты клиентов <span className="text-destructive">*</span>
      </Label>
      <div className="flex gap-2">
        {SEGMENTS.map((seg) => (
          <button
            key={seg}
            type="button"
            onClick={() => toggle(seg)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-sm transition-colors",
              value.includes(seg)
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {seg}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Можно выбрать несколько</p>
    </div>
  )
}

function ProductForm({
  data,
  onChange,
}: {
  data: Partial<CompanyProduct>
  onChange: (data: Partial<CompanyProduct>) => void
}) {
  const update = <K extends keyof CompanyProduct>(field: K, value: CompanyProduct[K]) =>
    onChange({ ...data, [field]: value })

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="product-name">
          Название продукта / услуги <span className="text-destructive">*</span>
        </Label>
        <Input
          id="product-name"
          placeholder="CRM-система для отделов продаж"
          value={data.name ?? ""}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-desc">
          Описание в 1–2 предложениях <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="product-desc"
          placeholder="Что продаёте, кому, какую задачу это решает для клиента"
          value={data.description ?? ""}
          onChange={(e) => update("description", e.target.value)}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Используется для демонстрации должности кандидату и AI-скоринга
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="avg-check">Средний чек, ₽</Label>
          <Input
            id="avg-check"
            type="number"
            placeholder="150 000"
            min={0}
            value={data.avg_check ?? ""}
            onChange={(e) => update("avg_check", parseFloat(e.target.value) || undefined)}
          />
          <p className="text-xs text-muted-foreground">Влияет на подбор с релевантным опытом</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="margin">Маржа, %</Label>
          <Input
            id="margin"
            type="number"
            placeholder="35"
            min={0}
            max={100}
            value={data.margin_pct ?? ""}
            onChange={(e) => update("margin_pct", parseFloat(e.target.value) || undefined)}
          />
          <p className="text-xs text-muted-foreground">Необязательно</p>
        </div>
      </div>

      <Separator />

      <RadioGroup
        label="Тип продаж"
        options={SALES_TYPES}
        value={data.sales_type}
        onChange={(v) => update("sales_type", v as CompanyProduct["sales_type"])}
        required
      />

      <RadioGroup
        label="Цикл сделки"
        options={DEAL_CYCLES}
        value={data.deal_cycle}
        onChange={(v) => update("deal_cycle", v as CompanyProduct["deal_cycle"])}
        required
      />

      <SegmentCheckboxes
        value={data.segments ?? []}
        onChange={(v) => update("segments", v)}
      />
    </div>
  )
}

export function StepProduct({
  data,
  onChange,
  isMultiProduct,
  companyId,
  selectedProductId,
  onSelectProduct,
}: StepProductProps) {
  // Products are managed server-side via API; no localStorage loading
  const [existingProducts] = useState<CompanyProduct[]>([])
  const [showNewForm, setShowNewForm] = useState(false)

  if (!isMultiProduct) {
    // Single product — show inline form directly
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground">
          Заполните информацию о продукте или услуге, которую будет продавать новый сотрудник.
        </div>
        <ProductForm data={data} onChange={onChange} />
      </div>
    )
  }

  // Multi-product — selector or new form
  const selectedProduct = existingProducts.find((p) => p.id === selectedProductId)

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground">
        У вашей компании несколько направлений. Выберите продукт для этой вакансии или создайте новый.
      </div>

      {existingProducts.length > 0 && !showNewForm && (
        <div className="space-y-1.5">
          <Label>Выберите продукт / направление</Label>
          <Select
            value={selectedProductId ?? ""}
            onValueChange={(v) => {
              onSelectProduct(v || undefined)
              // Pre-fill form with selected product data
              const prod = existingProducts.find((p) => p.id === v)
              if (prod) onChange(prod)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите продукт" />
            </SelectTrigger>
            <SelectContent>
              {existingProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedProduct && !showNewForm && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
          <p className="text-sm font-medium text-foreground">{selectedProduct.name}</p>
          <p className="text-xs text-muted-foreground">{selectedProduct.description}</p>
          <div className="flex gap-2 text-xs text-muted-foreground">
            {selectedProduct.segments.map((s) => (
              <span key={s} className="bg-muted rounded px-1.5 py-0.5">{s}</span>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-primary px-0"
            onClick={() => {
              onChange(selectedProduct)
              onSelectProduct(undefined)
              setShowNewForm(false)
            }}
          >
            Изменить данные
          </Button>
        </div>
      )}

      {!showNewForm && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setShowNewForm(true)
            onSelectProduct(undefined)
            onChange({ segments: [] })
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить новый продукт
        </Button>
      )}

      {showNewForm && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Новый продукт</h4>
            {existingProducts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowNewForm(false)}
              >
                Отмена
              </Button>
            )}
          </div>
          <ProductForm data={data} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
