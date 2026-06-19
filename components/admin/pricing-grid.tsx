"use client"

/**
 * components/admin/pricing-grid.tsx
 *
 * Переиспользуемый компонент управления ценами и скидками.
 *   Секция А — цены за продукты (модули)
 *   Секция Б — скидки за набор (лесенка)
 *   Секция В — живой калькулятор (computeBundlePrice)
 */

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Plus, Trash2, Tag, Calculator, Layers } from "lucide-react"
import { computeBundlePrice } from "@/lib/pricing/calc"

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface ProductPricingRow {
  moduleId: string
  priceKopecks: number
  isActive: boolean
  sortOrder: number
}

export interface BundleRow {
  minProducts: number
  maxProducts: number | null   // null = без верхней границы
  discountPercent: number
  description: string
  isActive: boolean
}

export interface PricingGridValue {
  products: ProductPricingRow[]
  discounts: BundleRow[]
}

interface PricingGridProps {
  /** Все доступные модули платформы */
  modules: { id: string; name: string }[]
  /** Текущие настройки цен */
  pricing: ProductPricingRow[]
  /** Текущие правила скидок */
  discounts: BundleRow[]
  /** Режим редактирования */
  editable: boolean
  /** Колбэк при любом изменении (не вызывается при editable=false) */
  onChange?: (next: PricingGridValue) => void
}

// ─── Хелперы ──────────────────────────────────────────────────────────────────

function fmtKopecks(k: number): string {
  return (k / 100).toLocaleString("ru-RU") + " ₽"
}

function parseKopecks(s: string): number {
  const n = parseFloat(s.replace(",", "."))
  if (isNaN(n) || n < 0) return 0
  return Math.round(n * 100)
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export function PricingGrid({
  modules,
  pricing,
  discounts,
  editable,
  onChange,
}: PricingGridProps) {
  // Локальное состояние (только при editable)
  const [localPricing, setLocalPricing] = useState<ProductPricingRow[]>(pricing)
  const [localDiscounts, setLocalDiscounts] = useState<BundleRow[]>(discounts)

  // Текстовые значения полей цен (во избежание проблем с NaN при вводе)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of pricing) m[p.moduleId] = String(p.priceKopecks / 100)
    return m
  })

  // Калькулятор
  const [calcSelected, setCalcSelected] = useState<Set<string>>(new Set())

  const effectivePricing = editable ? localPricing : pricing
  const effectiveDiscounts = editable ? localDiscounts : discounts

  // Правила для calc в формате computeBundlePrice
  const discountRules = useMemo(() => effectiveDiscounts
    .filter(d => d.isActive)
    .map(d => ({
      minProducts: d.minProducts,
      maxProducts: d.maxProducts,
      discountPercent: d.discountPercent,
    })), [effectiveDiscounts])

  // Элементы для расчёта
  const calcItems = useMemo(() => effectivePricing
    .filter(p => p.isActive && calcSelected.has(p.moduleId))
    .map(p => ({ moduleId: p.moduleId, priceKopecks: p.priceKopecks })),
    [effectivePricing, calcSelected])

  const calcResult = useMemo(() => computeBundlePrice(calcItems, discountRules), [calcItems, discountRules])

  function notify(next: PricingGridValue) {
    onChange?.(next)
  }

  // ── Секция А: цены ─────────────────────────────────────────────────────────

  function setProductPrice(moduleId: string, rawInput: string) {
    setPriceInputs(prev => ({ ...prev, [moduleId]: rawInput }))
    const kopecks = parseKopecks(rawInput)
    setLocalPricing(prev => {
      const next = prev.map(p => p.moduleId === moduleId ? { ...p, priceKopecks: kopecks } : p)
      notify({ products: next, discounts: localDiscounts })
      return next
    })
  }

  function setProductActive(moduleId: string, isActive: boolean) {
    setLocalPricing(prev => {
      const next = prev.map(p => p.moduleId === moduleId ? { ...p, isActive } : p)
      notify({ products: next, discounts: localDiscounts })
      return next
    })
  }

  // ── Секция Б: скидки ────────────────────────────────────────────────────────

  function addDiscount() {
    const maxMin = localDiscounts.reduce((m, d) => Math.max(m, d.minProducts), 0)
    const newRow: BundleRow = {
      minProducts: maxMin + 1,
      maxProducts: null,
      discountPercent: 5,
      description: "",
      isActive: true,
    }
    const next = [...localDiscounts, newRow]
    setLocalDiscounts(next)
    notify({ products: localPricing, discounts: next })
  }

  function removeDiscount(idx: number) {
    const next = localDiscounts.filter((_, i) => i !== idx)
    setLocalDiscounts(next)
    notify({ products: localPricing, discounts: next })
  }

  function patchDiscount<K extends keyof BundleRow>(idx: number, field: K, value: BundleRow[K]) {
    setLocalDiscounts(prev => {
      const next = prev.map((d, i) => i === idx ? { ...d, [field]: value } : d)
      notify({ products: localPricing, discounts: next })
      return next
    })
  }

  // ── Секция В: калькулятор ──────────────────────────────────────────────────

  function toggleCalc(moduleId: string) {
    setCalcSelected(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId)
      return next
    })
  }

  const activePricing = effectivePricing.filter(p => p.isActive)

  return (
    <div className="space-y-6">

      {/* Секция А: цены за продукты */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="w-4 h-4 text-violet-600" />
            Цены за продукты
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable>
            <DataHead>
              <DataHeadCell>Модуль</DataHeadCell>
              <DataHeadCell align="right">Цена ₽/мес</DataHeadCell>
              {editable && <DataHeadCell align="center">Активен</DataHeadCell>}
            </DataHead>
            <tbody>
              {effectivePricing.length === 0 && (
                <tr>
                  <td colSpan={editable ? 3 : 2} className="text-center py-8 text-sm text-muted-foreground">
                    Нет продуктов. Сначала добавьте модули в тариф.
                  </td>
                </tr>
              )}
              {effectivePricing.map(row => {
                const mod = modules.find(m => m.id === row.moduleId)
                const label = mod?.name ?? row.moduleId
                return (
                  <DataRow key={row.moduleId} className={!row.isActive ? "opacity-50" : undefined}>
                    <DataCell>
                      <span className="font-medium text-sm">{label}</span>
                    </DataCell>
                    <DataCell align="right">
                      {editable ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-7 w-28 text-sm text-right"
                            value={priceInputs[row.moduleId] ?? String(row.priceKopecks / 100)}
                            onChange={e => setProductPrice(row.moduleId, e.target.value)}
                          />
                          <span className="text-xs text-muted-foreground">₽</span>
                        </div>
                      ) : (
                        <span className="font-medium tabular-nums">{fmtKopecks(row.priceKopecks)}</span>
                      )}
                    </DataCell>
                    {editable && (
                      <DataCell align="center">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={v => setProductActive(row.moduleId, v)}
                          className="scale-90"
                        />
                      </DataCell>
                    )}
                  </DataRow>
                )
              })}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Секция Б: скидки за набор */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-600" />
            Скидки за набор
          </CardTitle>
        </CardHeader>
        <CardContent className={effectiveDiscounts.length > 0 ? "p-0" : undefined}>
          {effectiveDiscounts.length === 0 ? (
            <p className="text-sm text-muted-foreground pb-2">Пороговых скидок пока нет.</p>
          ) : (
            <DataTable>
              <DataHead>
                <DataHeadCell>От продуктов</DataHeadCell>
                <DataHeadCell>До</DataHeadCell>
                <DataHeadCell align="right">Скидка %</DataHeadCell>
                <DataHeadCell>Описание</DataHeadCell>
                {editable && <DataHeadCell align="center">Активна</DataHeadCell>}
                {editable && <DataHeadCell />}
              </DataHead>
              <tbody>
                {effectiveDiscounts.map((row, idx) => (
                  <DataRow key={idx} className={!row.isActive ? "opacity-50" : undefined}>
                    <DataCell>
                      {editable ? (
                        <Input
                          type="number" min="1" className="h-7 w-20 text-sm"
                          value={row.minProducts}
                          onChange={e => patchDiscount(idx, "minProducts", parseInt(e.target.value) || 1)}
                        />
                      ) : (
                        <span className="tabular-nums">{row.minProducts}</span>
                      )}
                    </DataCell>
                    <DataCell>
                      {editable ? (
                        <Input
                          type="number" min="1" placeholder="∞" className="h-7 w-20 text-sm"
                          value={row.maxProducts ?? ""}
                          onChange={e => {
                            const v = e.target.value.trim()
                            patchDiscount(idx, "maxProducts", v === "" ? null : parseInt(v) || null)
                          }}
                        />
                      ) : (
                        <span className="tabular-nums">{row.maxProducts ?? "∞"}</span>
                      )}
                    </DataCell>
                    <DataCell align="right">
                      {editable ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number" min="0" max="100" step="0.1" className="h-7 w-20 text-sm text-right"
                            value={row.discountPercent}
                            onChange={e => patchDiscount(idx, "discountPercent", parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      ) : (
                        <span className="font-medium tabular-nums">{row.discountPercent}%</span>
                      )}
                    </DataCell>
                    <DataCell>
                      {editable ? (
                        <Input
                          className="h-7 text-sm"
                          placeholder="Напр. «Стартер» (необязательно)"
                          value={row.description}
                          onChange={e => patchDiscount(idx, "description", e.target.value)}
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">{row.description || "—"}</span>
                      )}
                    </DataCell>
                    {editable && (
                      <DataCell align="center">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={v => patchDiscount(idx, "isActive", v)}
                          className="scale-90"
                        />
                      </DataCell>
                    )}
                    {editable && (
                      <DataCell>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeDiscount(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </DataCell>
                    )}
                  </DataRow>
                ))}
              </tbody>
            </DataTable>
          )}
          {editable && (
            <div className="px-4 py-3 border-t">
              <Button size="sm" variant="outline" className="gap-2 h-8" onClick={addDiscount}>
                <Plus className="w-3.5 h-3.5" />
                Добавить порог
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Секция В: калькулятор */}
      {activePricing.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4 text-violet-600" />
              Калькулятор набора
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Выберите продукты, чтобы увидеть итоговую цену с учётом скидки за набор.
            </p>

            {/* Чекбоксы продуктов */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
              {activePricing.map(row => {
                const mod = modules.find(m => m.id === row.moduleId)
                const label = mod?.name ?? row.moduleId
                const checked = calcSelected.has(row.moduleId)
                return (
                  <div key={row.moduleId} className="flex items-center gap-2">
                    <Checkbox
                      id={`calc-${row.moduleId}`}
                      checked={checked}
                      onCheckedChange={() => toggleCalc(row.moduleId)}
                    />
                    <Label htmlFor={`calc-${row.moduleId}`} className="text-sm cursor-pointer leading-tight">
                      <span className="block">{label}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {fmtKopecks(row.priceKopecks)}
                      </span>
                    </Label>
                  </div>
                )
              })}
            </div>

            {/* Итог */}
            {calcSelected.size > 0 && (
              <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Σ {calcResult.productCount} {calcResult.productCount === 1 ? "продукт" : calcResult.productCount < 5 ? "продукта" : "продуктов"}
                  </span>
                  <span className="font-medium tabular-nums">{fmtKopecks(calcResult.subtotalKopecks)}</span>
                  {calcResult.discountPercent > 0 && (
                    <>
                      <span className="text-muted-foreground">−</span>
                      <span className="text-emerald-600 font-medium">скидка {calcResult.discountPercent}%</span>
                      <span className="text-muted-foreground tabular-nums">({fmtKopecks(calcResult.discountKopecks)})</span>
                      <span className="text-muted-foreground">=</span>
                    </>
                  )}
                  <span className="text-base font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                    ИТОГО {fmtKopecks(calcResult.totalKopecks)}/мес
                  </span>
                </div>
                {calcResult.discountPercent === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Скидка за набор не применяется (правил нет или порог не достигнут).
                  </p>
                )}
              </div>
            )}
            {calcSelected.size === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Отметьте продукты выше, чтобы рассчитать итог.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
