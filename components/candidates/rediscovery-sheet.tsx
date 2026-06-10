"use client"

/**
 * RediscoverySheet — поиск подходящих кандидатов из базы компании для текущей вакансии.
 * Открывается кнопкой «Поискать в базе» на табе «Кандидаты».
 */

import { useState, useEffect, useCallback } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Search, Users, Plus, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Типы ────────────────────────────────────────────────────────────────────

interface ScoredCandidate {
  candidateId:        string
  name:               string
  sourceVacancyTitle: string
  sourceVacancyId:    string
  score:              number
  reason:             string
}

interface SearchResult {
  totalPrefill:  number
  totalAiScored: number
  results:       ScoredCandidate[]
  ranAt:         string
}

// ─── Вспомогательные ─────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
  if (score >= 45) return "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
  return "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300"
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}.${mm} в ${hh}:${mi}`
}

// ─── Основной компонент ───────────────────────────────────────────────────────

interface RediscoverySheetProps {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  vacancyId:      string
  onAdded?:       () => void
}

export function RediscoverySheet({
  open,
  onOpenChange,
  vacancyId,
  onAdded,
}: RediscoverySheetProps) {
  const [searching, setSearching]   = useState(false)
  const [adding, setAdding]         = useState(false)
  const [result, setResult]         = useState<SearchResult | null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())

  // Загружаем кешированный результат при открытии
  const loadCached = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/rediscovery`)
      if (!res.ok) return
      const data = await res.json() as { lastRun: SearchResult | null }
      if (data.lastRun) setResult(data.lastRun)
    } catch { /* silent */ }
  }, [vacancyId])

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      loadCached()
    }
  }, [open, loadCached])

  const handleSearch = async () => {
    setSearching(true)
    setSelected(new Set())
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/rediscovery`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "search" }),
      })
      const data = await res.json() as SearchResult & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Ошибка поиска")
        return
      }
      setResult(data)
      if (data.results.length === 0) {
        toast.info("Подходящих кандидатов в базе не найдено")
      } else {
        toast.success(`Найдено ${data.results.length} кандидатов (оценено AI: ${data.totalAiScored} из ${data.totalPrefill})`)
      }
    } catch {
      toast.error("Ошибка поиска")
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async () => {
    if (selected.size === 0) return
    setAdding(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/rediscovery`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          action: "add",
          sourceCandidateIds: [...selected],
        }),
      })
      const data = await res.json() as { created: number; skipped: number; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Ошибка добавления")
        return
      }
      const msg = data.skipped > 0
        ? `Добавлено ${data.created}, пропущено ${data.skipped} (уже в вакансии)`
        : `Добавлено ${data.created} кандидатов`
      toast.success(msg)
      setSelected(new Set())
      onAdded?.()
    } catch {
      toast.error("Ошибка добавления")
    } finally {
      setAdding(false)
    }
  }

  const toggleAll = () => {
    if (!result) return
    if (selected.size === result.results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(result.results.map(r => r.candidateId)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasResults = result && result.results.length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            Поиск в базе кандидатов
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Поиск подходящих кандидатов из других вакансий компании с AI-оценкой.
          </p>
        </SheetHeader>

        {/* Кнопка запуска */}
        <div className="px-5 py-3 border-b shrink-0">
          <Button
            onClick={handleSearch}
            disabled={searching}
            size="sm"
            className="gap-2"
          >
            {searching
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Поиск и оценка AI…</>
              : <><Search className="w-3.5 h-3.5" />Запустить поиск</>
            }
          </Button>
          {result && (
            <p className="text-xs text-muted-foreground mt-2">
              Последний запуск: {formatDate(result.ranAt)} ·{" "}
              обработано {result.totalAiScored} из {result.totalPrefill} кандидатов базы
            </p>
          )}
        </div>

        {/* Результаты */}
        <div className="flex-1 overflow-y-auto">
          {searching && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <div className="text-sm text-center">
                <p className="font-medium">Анализируем базу кандидатов…</p>
                <p className="text-xs mt-1">AI оценивает топ-50 кандидатов батчами</p>
              </div>
            </div>
          )}

          {!searching && !result && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users className="w-8 h-8 opacity-30" />
              <p className="text-sm">Нажмите «Запустить поиск», чтобы найти подходящих</p>
              <p className="text-xs">кандидатов из других вакансий компании</p>
            </div>
          )}

          {!searching && result && result.results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users className="w-8 h-8 opacity-30" />
              <p className="text-sm">Подходящих кандидатов не найдено</p>
              <p className="text-xs">В базе компании {result.totalPrefill} кандидатов — ни один не прошёл отбор</p>
            </div>
          )}

          {!searching && hasResults && (
            <>
              {/* Шапка таблицы */}
              <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-3 sticky top-0">
                <Checkbox
                  checked={selected.size === result.results.length && result.results.length > 0}
                  onCheckedChange={toggleAll}
                  aria-label="Выбрать всех"
                  className="shrink-0"
                />
                <span className="text-xs text-muted-foreground flex-1">
                  {result.results.length} кандидатов · {selected.size > 0 ? `${selected.size} выбрано` : "выберите для добавления"}
                </span>
              </div>

              {/* Список */}
              <div className="divide-y">
                {result.results.map((cand) => (
                  <div
                    key={cand.candidateId}
                    className={cn(
                      "px-4 py-3 flex items-start gap-3 hover:bg-accent/40 transition-colors cursor-pointer",
                      selected.has(cand.candidateId) && "bg-primary/5",
                    )}
                    onClick={() => toggleOne(cand.candidateId)}
                  >
                    <Checkbox
                      checked={selected.has(cand.candidateId)}
                      onCheckedChange={() => toggleOne(cand.candidateId)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{cand.name}</span>
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-4 shrink-0 border-0",
                            scoreColor(cand.score),
                          )}
                        >
                          {cand.score}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{cand.sourceVacancyTitle}</span>
                      </div>
                      {cand.reason && cand.reason !== "—" && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {cand.reason}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Нижняя панель с кнопкой добавления */}
        {hasResults && selected.size > 0 && (
          <div className="px-5 py-3 border-t bg-background shrink-0">
            <Button
              onClick={handleAdd}
              disabled={adding}
              className="w-full gap-2"
            >
              {adding
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Добавление…</>
                : <><Plus className="w-3.5 h-3.5" />Добавить выбранных ({selected.size})</>
              }
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
