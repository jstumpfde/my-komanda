"use client"

// UX-переделка стоп-фактора «Гражданство» (общий компонент для spec-editor.tsx
// и vacancy-stop-factors-settings.tsx — оба хранят один и тот же путь данных
// stopFactors.citizenship, но в разных обёртках). Заменяет старый CSV-инпут:
// режим allow/deny + чипы стран/континентов + быстрый выбор топ-5 + попап
// произвольного ввода. Обвязка enabled/rejectionText остаётся на вызывающей
// стороне (FactorRow там же, где и раньше) — этот компонент отвечает только
// за редактирование самого значения citizenship.

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Plus, X } from "lucide-react"
import type { VacancyStopFactorCitizenship } from "@/lib/db/schema"
import {
  QUICK_CITIZENSHIP_COUNTRIES,
  CONTINENT_COUNTRY_CODES,
  CONTINENT_LABELS,
  citizenshipCodeLabel,
  continentCode,
  resolveCitizenshipInput,
} from "@/lib/funnel-builder/citizenship-countries"

/** Сводка для FactorSummary-компонента вызывающей стороны (pass/cut/idle). */
export function citizenshipSummary(
  value: VacancyStopFactorCitizenship | undefined,
): { pass?: string; cut?: string; idle?: string } {
  const mode = value?.mode ?? "allow"
  if (mode === "deny") {
    const denied = value?.denied ?? []
    if (denied.length === 0) return { idle: "Страны не указаны — фактор не действует." }
    const labels = denied.map(citizenshipCodeLabel).join(", ")
    return {
      cut: `Авто-отказ: ${labels}.`,
      pass: "Прочих пропускаем.",
    }
  }
  const allowed = value?.allowed ?? []
  if (allowed.length === 0) return { idle: "Страны не указаны — фактор не действует." }
  const labels = allowed.map(citizenshipCodeLabel).join(", ")
  return {
    pass: `Пропускаем: ${labels}.`,
    cut: "Авто-отказ прочим.",
  }
}

interface Props {
  value: VacancyStopFactorCitizenship | undefined
  onChange: (next: VacancyStopFactorCitizenship) => void
}

export function CitizenshipFactorField({ value, onChange }: Props) {
  const [customInput, setCustomInput] = useState("")
  const [popoverOpen, setPopoverOpen] = useState(false)

  const mode = value?.mode ?? "allow"
  const listKey: "allowed" | "denied" = mode === "deny" ? "denied" : "allowed"
  const list = (mode === "deny" ? value?.denied : value?.allowed) ?? []

  const setMode = (next: "allow" | "deny") => {
    onChange({ ...(value ?? { enabled: true }), mode: next })
  }

  const addCode = (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    if (list.some(c => c.toUpperCase() === trimmed.toUpperCase())) return
    onChange({ ...(value ?? { enabled: true }), mode, [listKey]: [...list, trimmed] })
  }

  const removeCode = (code: string) => {
    onChange({ ...(value ?? { enabled: true }), mode, [listKey]: list.filter(c => c !== code) })
  }

  const addCustom = () => {
    const resolved = resolveCitizenshipInput(customInput)
    if (!resolved) return
    addCode(resolved)
    setCustomInput("")
  }

  return (
    <div className="space-y-2">
      {/* Переключатель режима — бейджи-кнопки, как остальные факторы этого файла (см. «Формат работы»). */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode("allow")}
          className={cn(
            "text-xs px-2.5 py-1 rounded-md border transition-colors",
            mode === "allow" ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground border-border hover:text-foreground",
          )}
        >
          Разрешить только
        </button>
        <button
          type="button"
          onClick={() => setMode("deny")}
          className={cn(
            "text-xs px-2.5 py-1 rounded-md border transition-colors",
            mode === "deny" ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground border-border hover:text-foreground",
          )}
        >
          Исключить
        </button>
      </div>

      {/* Чипы выбранных стран/континентов */}
      <div className="flex flex-wrap gap-1.5">
        {list.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Список пуст</span>
        )}
        {list.map((code) => (
          <Badge key={code} variant="secondary" className="text-xs gap-1 pr-1 font-normal">
            {citizenshipCodeLabel(code)}
            <button
              type="button"
              onClick={() => removeCode(code)}
              className="hover:text-destructive ml-0.5"
              aria-label={`Убрать ${citizenshipCodeLabel(code)}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}

        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 gap-1 text-xs">
              <Plus className="w-3 h-3" />
              Добавить
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="start">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Быстрый выбор</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CITIZENSHIP_COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => addCode(c.code)}
                    disabled={list.includes(c.code)}
                    className="text-xs px-2 py-1 rounded-md border border-border hover:text-foreground hover:border-primary/50 text-muted-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {mode === "deny" && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Континенты</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(CONTINENT_COUNTRY_CODES).map((key) => {
                    const code = continentCode(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => addCode(code)}
                        disabled={list.includes(code)}
                        className="text-xs px-2 py-1 rounded-md border border-border hover:text-foreground hover:border-primary/50 text-muted-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        {CONTINENT_LABELS[key] ?? key}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Своя страна</p>
              <div className="flex gap-1.5">
                <Input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom() } }}
                  placeholder="Код (RU) или название"
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" onClick={addCustom} disabled={!customInput.trim()} className="shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
