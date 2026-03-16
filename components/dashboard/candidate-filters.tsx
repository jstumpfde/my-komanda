"use client"

import { useState } from "react"
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
import { Filter, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FilterState {
  searchText: string
  cities: string[]
  salaryMin: number
  salaryMax: number
  scoreMin: number
  sources: string[]
}

interface CandidateFiltersProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

const CITIES = ["Москва", "Санкт-Петербург", "Казань"]
const SOURCES = ["hh.ru", "Avito", "LinkedIn", "Telegram"]

export function CandidateFilters({ filters, onFiltersChange }: CandidateFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, searchText: value })
  }

  const handleCityToggle = (city: string) => {
    const newCities = filters.cities.includes(city)
      ? filters.cities.filter(c => c !== city)
      : [...filters.cities, city]
    onFiltersChange({ ...filters, cities: newCities })
  }

  const handleSourceToggle = (source: string) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter(s => s !== source)
      : [...filters.sources, source]
    onFiltersChange({ ...filters, sources: newSources })
  }

  const handleSalaryMinChange = (value: number[]) => {
    onFiltersChange({ ...filters, salaryMin: value[0] })
  }

  const handleSalaryMaxChange = (value: number[]) => {
    onFiltersChange({ ...filters, salaryMax: value[0] })
  }

  const handleScoreMinChange = (value: number[]) => {
    onFiltersChange({ ...filters, scoreMin: value[0] })
  }

  const handleReset = () => {
    onFiltersChange({
      searchText: "",
      cities: [],
      salaryMin: 0,
      salaryMax: 250000,
      scoreMin: 0,
      sources: [],
    })
  }

  const hasActiveFilters = 
    filters.searchText || 
    filters.cities.length > 0 || 
    filters.salaryMin > 0 || 
    filters.salaryMax < 250000 || 
    filters.scoreMin > 0 || 
    filters.sources.length > 0

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant={hasActiveFilters ? "default" : "outline"} 
          size="sm" 
          className="h-9 relative"
        >
          <Filter className="size-4 mr-2" />
          Фильтры
          {hasActiveFilters && (
            <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary-foreground text-primary">
              {[
                filters.searchText ? 1 : 0,
                filters.cities.length,
                filters.sources.length,
                filters.scoreMin > 0 ? 1 : 0,
              ].reduce((a, b) => a + b, 0)}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Фильтры поиска</h3>
          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleReset}
            >
              Сбросить
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Поиск по имени</label>
          <Input
            placeholder="Введите имя кандидата..."
            value={filters.searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Cities */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Города</label>
          <div className="space-y-2">
            {CITIES.map((city) => (
              <div key={city} className="flex items-center gap-2">
                <Checkbox
                  id={`city-${city}`}
                  checked={filters.cities.includes(city)}
                  onCheckedChange={() => handleCityToggle(city)}
                />
                <label htmlFor={`city-${city}`} className="text-sm cursor-pointer">
                  {city}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Sources */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Источники</label>
          <div className="space-y-2">
            {SOURCES.map((source) => (
              <div key={source} className="flex items-center gap-2">
                <Checkbox
                  id={`source-${source}`}
                  checked={filters.sources.includes(source)}
                  onCheckedChange={() => handleSourceToggle(source)}
                />
                <label htmlFor={`source-${source}`} className="text-sm cursor-pointer">
                  {source}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Salary Range */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Зарплата от {filters.salaryMin.toLocaleString()}</label>
          <Slider
            value={[filters.salaryMin]}
            onValueChange={handleSalaryMinChange}
            min={0}
            max={250000}
            step={10000}
            className="w-full"
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Зарплата до {filters.salaryMax.toLocaleString()}</label>
          <Slider
            value={[filters.salaryMax]}
            onValueChange={handleSalaryMaxChange}
            min={0}
            max={250000}
            step={10000}
            className="w-full"
          />
        </div>

        {/* Score */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Минимальный рейтинг: {filters.scoreMin}</label>
          <Slider
            value={[filters.scoreMin]}
            onValueChange={handleScoreMinChange}
            min={0}
            max={100}
            step={5}
            className="w-full"
          />
        </div>

        <Button 
          variant="default" 
          className="w-full h-8 text-sm"
          onClick={() => setIsOpen(false)}
        >
          Применить
        </Button>
      </PopoverContent>
    </Popover>
  )
}
