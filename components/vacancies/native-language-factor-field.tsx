"use client"

// Стоп-фактор «Родной язык» (03.07, ПОЛНАЯ КОПИЯ citizenship-factor-field.tsx —
// общий компонент для spec-editor.tsx и vacancy-stop-factors-settings.tsx, оба
// хранят один и тот же путь данных stopFactors.nativeLanguage). Режим
// allow/deny + чипы языков + быстрый выбор топ-языков + попап произвольного
// ввода. Обвязка enabled/rejectionText остаётся на вызывающей стороне
// (FactorRow там же, где и citizenship) — этот компонент отвечает только за
// редактирование самого значения nativeLanguage. В отличие от гражданства,
// континентов/групп у языков нет — список плоский.

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Plus, X } from "lucide-react"
import type { VacancyStopFactorNativeLanguage } from "@/lib/db/schema"
import {
  QUICK_NATIVE_LANGUAGES,
  nativeLanguageCodeLabel,
  resolveNativeLanguageInput,
} from "@/lib/funnel-builder/native-languages"

/** Сводка для FactorSummary-компонента вызывающей стороны (pass/cut/idle). */
export function nativeLanguageSummary(
  value: VacancyStopFactorNativeLanguage | undefined,
): { pass?: string; cut?: string; idle?: string } {
  const mode = value?.mode ?? "allow"
  if (mode === "deny") {
    const denied = value?.denied ?? []
    if (denied.length === 0) return { idle: "Языки не указаны — фактор не действует." }
    const labels = denied.map(nativeLanguageCodeLabel).join(", ")
    return {
      cut: `Авто-отказ: родной ${labels}.`,
      pass: "Прочих пропускаем.",
    }
  }
  const allowed = value?.allowed ?? []
  if (allowed.length === 0) return { idle: "Языки не указаны — фактор не действует." }
  const labels = allowed.map(nativeLanguageCodeLabel).join(", ")
  return {
    pass: `Пропускаем: родной ${labels}.`,
    cut: "Авто-отказ прочим.",
  }
}

interface Props {
  value: VacancyStopFactorNativeLanguage | undefined
  onChange: (next: VacancyStopFactorNativeLanguage) => void
}

export function NativeLanguageFactorField({ value, onChange }: Props) {
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
    if (list.some(c => c.toLowerCase() === trimmed.toLowerCase())) return
    onChange({ ...(value ?? { enabled: true }), mode, [listKey]: [...list, trimmed] })
  }

  const removeCode = (code: string) => {
    onChange({ ...(value ?? { enabled: true }), mode, [listKey]: list.filter(c => c !== code) })
  }

  const addCustom = () => {
    const resolved = resolveNativeLanguageInput(customInput)
    if (!resolved) return
    addCode(resolved)
    setCustomInput("")
  }

  return (
    <div className="space-y-2">
      {/* Переключатель режима — бейджи-кнопки, как остальные факторы (см. «Гражданство»). */}
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

      {/* Чипы выбранных языков */}
      <div className="flex flex-wrap gap-1.5">
        {list.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Список пуст</span>
        )}
        {list.map((code) => (
          <Badge key={code} variant="secondary" className="text-xs gap-1 pr-1 font-normal">
            {nativeLanguageCodeLabel(code)}
            <button
              type="button"
              onClick={() => removeCode(code)}
              className="hover:text-destructive ml-0.5"
              aria-label={`Убрать ${nativeLanguageCodeLabel(code)}`}
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
                {QUICK_NATIVE_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => addCode(l.code)}
                    disabled={list.includes(l.code)}
                    className="text-xs px-2 py-1 rounded-md border border-border hover:text-foreground hover:border-primary/50 text-muted-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Свой язык</p>
              <div className="flex gap-1.5">
                <Input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom() } }}
                  placeholder="Код (rus) или название"
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
