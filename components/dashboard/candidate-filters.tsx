"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Search, Settings, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Candidate } from "./candidate-card"

export interface FilterState {
  searchText: string
  cities: string[]
  salaryMin: number
  salaryMax: number
  scoreMin: number
  sources: string[]
  workFormats: string[]
}

interface CandidateFiltersProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  candidates?: Candidate[]
}

export function CandidateFilters({ filters, onFiltersChange, candidates = [] }: CandidateFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)

  // Compute dynamic lists from candidates
  const cityCounts = useMemo(() => {
    const map = new Map<string, number>()
    candidates.forEach((c) => map.set(c.city, (map.get(c.city) || 0) + 1))
    return Array.from(map.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
  }, [candidates])

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>()
    candidates.forEach((c) => map.set(c.source, (map.get(c.source) || 0) + 1))
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
  }, [candidates])

  const FORMAT_LABELS: Record<string, string> = { office: "Офис", remote: "Удалённо", hybrid: "Гибрид" }
  const formatCounts = useMemo(() => {
    const map = new Map<string, number>()
    candidates.forEach((c) => { const f = (c as any).workFormat || "office"; map.set(f, (map.get(f) || 0) + 1) })
    return ["office", "remote", "hybrid"].map((f) => ({ format: f, label: FORMAT_LABELS[f], count: map.get(f) || 0 })).filter((f) => f.count > 0)
  }, [candidates])

  const handleFormatToggle = (format: string) => {
    const cur = filters.workFormats || []
    const newFormats = cur.includes(format) ? cur.filter((f) => f !== format) : [...cur, format]
    onFiltersChange({ ...filters, workFormats: newFormats })
  }

  const visibleCities = showAllCities ? cityCounts : cityCounts.slice(0, 3)
  const hiddenCitiesCount = cityCounts.length - 3
  const visibleSources = showAllSources ? sourceCounts : sourceCounts.slice(0, 3)
  const hiddenSourcesCount = sourceCounts.length - 3

  const handleCityToggle = (city: string) => {
    const newCities = filters.cities.includes(city)
      ? filters.cities.filter((c) => c !== city)
      : [...filters.cities, city]
    onFiltersChange({ ...filters, cities: newCities })
  }

  const handleSourceToggle = (source: string) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source]
    onFiltersChange({ ...filters, sources: newSources })
  }

  const handleReset = () => {
    onFiltersChange({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, sources: [], workFormats: [] })
  }

  const activeCount = [
    filters.searchText ? 1 : 0,
    filters.cities.length > 0 ? 1 : 0,
    filters.sources.length > 0 ? 1 : 0,
    filters.workFormats.length > 0 ? 1 : 0,
    filters.scoreMin > 0 ? 1 : 0,
    filters.salaryMin > 0 || filters.salaryMax < 250000 ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const hasActiveFilters = activeCount > 0

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
        >
          <Search className="size-3.5" />
          Поиск
          {hasActiveFilters && (
            <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary-foreground text-primary">
              {activeCount}
            </Badge>
          )}
          <Settings className="size-3.5 ml-0.5 text-current opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-sm">Поиск кандидатов</h3>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReset}>
              Сбросить
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Поиск по имени</label>
          <Input
            placeholder="Введите имя..."
            value={filters.searchText}
            onChange={(e) => onFiltersChange({ ...filters, searchText: e.target.value })}
            className="h-8 text-sm"
          />
        </div>

        {/* Cities (dynamic) */}
        {cityCounts.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Города</label>
            <div className="space-y-1">
              {visibleCities.map(({ city, count }) => (
                <div key={city} className="flex items-center gap-2">
                  <Checkbox
                    id={`city-${city}`}
                    checked={filters.cities.includes(city)}
                    onCheckedChange={() => handleCityToggle(city)}
                  />
                  <label htmlFor={`city-${city}`} className="text-sm cursor-pointer flex-1">{city}</label>
                  <span className="text-xs text-muted-foreground">({count})</span>
                </div>
              ))}
            </div>
            {hiddenCitiesCount > 0 && !showAllCities && (
              <button className="text-xs text-primary hover:underline" onClick={() => setShowAllCities(true)}>
                + ещё {hiddenCitiesCount} {hiddenCitiesCount === 1 ? "город" : hiddenCitiesCount < 5 ? "города" : "городов"}
              </button>
            )}
            {showAllCities && hiddenCitiesCount > 0 && (
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowAllCities(false)}>
                Свернуть
              </button>
            )}
          </div>
        )}

        {/* Sources (dynamic) */}
        {sourceCounts.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Источники</label>
            <div className="space-y-1">
              {visibleSources.map(({ source, count }) => (
                <div key={source} className="flex items-center gap-2">
                  <Checkbox
                    id={`source-${source}`}
                    checked={filters.sources.includes(source)}
                    onCheckedChange={() => handleSourceToggle(source)}
                  />
                  <label htmlFor={`source-${source}`} className="text-sm cursor-pointer flex-1">{source}</label>
                  <span className="text-xs text-muted-foreground">({count})</span>
                </div>
              ))}
            </div>
            {hiddenSourcesCount > 0 && !showAllSources && (
              <button className="text-xs text-primary hover:underline" onClick={() => setShowAllSources(true)}>
                + ещё {hiddenSourcesCount}
              </button>
            )}
            {showAllSources && hiddenSourcesCount > 0 && (
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowAllSources(false)}>
                Свернуть
              </button>
            )}
          </div>
        )}

        {/* Work Format */}
        {formatCounts.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Формат работы</label>
            <div className="space-y-1">
              {formatCounts.map(({ format, label, count }) => (
                <div key={format} className="flex items-center gap-2">
                  <Checkbox
                    id={`format-${format}`}
                    checked={(filters.workFormats || []).includes(format)}
                    onCheckedChange={() => handleFormatToggle(format)}
                  />
                  <label htmlFor={`format-${format}`} className="text-sm cursor-pointer flex-1">{label}</label>
                  <span className="text-xs text-muted-foreground">({count})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Salary Range */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Зарплата: {filters.salaryMin.toLocaleString("ru-RU")} – {filters.salaryMax.toLocaleString("ru-RU")} ₽
          </label>
          <div className="space-y-2">
            <Slider value={[filters.salaryMin]} onValueChange={([v]) => onFiltersChange({ ...filters, salaryMin: v })} min={0} max={250000} step={10000} />
            <Slider value={[filters.salaryMax]} onValueChange={([v]) => onFiltersChange({ ...filters, salaryMax: v })} min={0} max={250000} step={10000} />
          </div>
        </div>

        {/* Score */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Минимальный AI-скор: {filters.scoreMin}</label>
          <Slider value={[filters.scoreMin]} onValueChange={([v]) => onFiltersChange({ ...filters, scoreMin: v })} min={0} max={100} step={5} />
        </div>

        <Button variant="default" className="w-full h-8 text-sm" onClick={() => setIsOpen(false)}>
          Применить
        </Button>
      </PopoverContent>
    </Popover>
  )
}
