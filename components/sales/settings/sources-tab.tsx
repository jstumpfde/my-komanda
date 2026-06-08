"use client"

import { useState, useEffect, useRef, KeyboardEvent } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, Plus, X, RotateCcw } from "lucide-react"
import { DEAL_SOURCES } from "@/lib/crm/deal-stages"

// Дефолтный список для подсказки (если у тенанта ещё нет своего)
const DEFAULT_SOURCES = [...DEAL_SOURCES]

interface SalesSettings {
  funnelType: string
  stages: unknown[]
  leadSources: string[] | null
  automations: unknown[] | null
}

export function SourcesTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sources, setSources] = useState<string[]>([])
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Загрузка ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch("/api/modules/sales/settings")
        if (!res.ok) throw new Error("Ошибка загрузки")
        const json = await res.json()
        const data = (json?.data ?? json) as SalesSettings
        if (!alive) return
        // Если leadSources === null — показываем дефолтный список как подсказку,
        // но НЕ сохраняем автоматически
        setSources(Array.isArray(data.leadSources) && data.leadSources.length > 0
          ? data.leadSources
          : DEFAULT_SOURCES.slice())
      } catch {
        if (alive) toast.error("Не удалось загрузить источники лидов")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ── Добавить источник ──
  const addSource = () => {
    const value = inputValue.trim()
    if (!value) return
    if (sources.some(s => s.toLowerCase() === value.toLowerCase())) {
      toast.error(`Источник «${value}» уже есть в списке`)
      return
    }
    setSources(prev => [...prev, value])
    setInputValue("")
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addSource()
    }
  }

  // ── Удалить источник ──
  const removeSource = (index: number) =>
    setSources(prev => prev.filter((_, i) => i !== index))

  // ── Сбросить к умолчанию ──
  const resetToDefaults = () => {
    setSources(DEFAULT_SOURCES.slice())
    toast.info("Список сброшен к набору по умолчанию. Сохраните, чтобы применить.")
  }

  // ── Сохранение ──
  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/modules/sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadSources: sources }),
      })

      if (res.status === 403) {
        toast.error("Только директор компании может изменять настройки")
        return
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? "Неизвестная ошибка")
      }

      const json = await res.json()
      const data = (json?.data ?? json) as SalesSettings
      if (Array.isArray(data.leadSources)) {
        setSources(data.leadSources)
      }
      toast.success("Источники лидов сохранены")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Источники лидов</CardTitle>
            <CardDescription className="mt-1">
              Откуда приходят клиенты — виджет, реклама, импорт, маркетплейсы, соцсети, звонок и т.п.
              Список используется при создании сделки для выбора источника.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={resetToDefaults} className="shrink-0 ml-4">
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сбросить
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Текущий список тегами */}
          {sources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sources.map((source, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="flex items-center gap-1.5 pr-1.5 text-sm font-normal"
                >
                  <span>{source}</span>
                  <button
                    onClick={() => removeSource(i)}
                    className="flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5"
                    aria-label={`Удалить источник «${source}»`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Список пуст. Добавьте первый источник ниже.
            </p>
          )}

          {/* Поле добавления нового источника */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Новый источник, например «Instagram»"
              className="flex-1"
              maxLength={80}
            />
            <Button
              variant="outline"
              onClick={addSource}
              disabled={!inputValue.trim()}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Добавить
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Нажмите Enter или кнопку «Добавить». Изменения вступят в силу после сохранения.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving
            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            : <Save className="h-4 w-4 mr-1.5" />
          }
          Сохранить
        </Button>
      </div>
    </div>
  )
}
