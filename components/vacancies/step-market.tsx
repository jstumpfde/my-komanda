"use client"

import { useMemo } from "react"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TrendingUp, Users, Star, ExternalLink } from "lucide-react"
import type { VacancyDraft } from "@/lib/vacancy-types"

interface Props {
  draft: VacancyDraft
  onChange: (draft: VacancyDraft) => void
}

const marketData: Record<string, { median: number; min: number; max: number }> = {
  "Продажи": { median: 95000, min: 60000, max: 180000 },
  "IT / Разработка": { median: 180000, min: 100000, max: 350000 },
  "Маркетинг": { median: 110000, min: 60000, max: 200000 },
  "Финансы": { median: 120000, min: 70000, max: 220000 },
  "HR": { median: 90000, min: 55000, max: 160000 },
  "Операции / Логистика": { median: 85000, min: 50000, max: 150000 },
  "Дизайн": { median: 120000, min: 70000, max: 250000 },
  "Аналитика": { median: 140000, min: 80000, max: 280000 },
  "Поддержка": { median: 65000, min: 40000, max: 120000 },
}

const examplesByCategory: Record<string, { title: string; company: string; salary: string; highlights: string; responses: number }[]> = {
  "Продажи": [
    { title: "Менеджер по продажам B2B", company: "СберРешения", salary: "120 000 – 180 000 ₽", highlights: "Прозрачная система KPI, ДМС со стоматологией, обучение", responses: 342 },
    { title: "Старший менеджер по работе с клиентами", company: "Яндекс", salary: "150 000 – 220 000 ₽", highlights: "Гибкий график, фитнес, акции компании", responses: 518 },
    { title: "Руководитель отдела продаж", company: "Тинькофф", salary: "180 000 – 300 000 ₽", highlights: "Бонус до 40% от оклада, корпоративное авто", responses: 267 },
  ],
  "IT / Разработка": [
    { title: "Senior Frontend разработчик", company: "VK", salary: "250 000 – 400 000 ₽", highlights: "React/TypeScript, удалёнка, акции, ДМС для семьи", responses: 189 },
    { title: "Golang Backend Developer", company: "Ozon", salary: "280 000 – 450 000 ₽", highlights: "Микросервисы, highload, опционы, гибкий график", responses: 134 },
    { title: "DevOps инженер", company: "Авито", salary: "220 000 – 350 000 ₽", highlights: "Kubernetes, CI/CD, AWS, обучение за счёт компании", responses: 98 },
  ],
  "Логистика": [
    { title: "Логист-экспедитор", company: "Деловые Линии", salary: "80 000 – 120 000 ₽", highlights: "Оклад + премия, ДМС, корпоративный транспорт", responses: 156 },
    { title: "Руководитель склада", company: "Wildberries", salary: "120 000 – 180 000 ₽", highlights: "Управление командой 30+, KPI-бонусы, карьерный рост", responses: 203 },
    { title: "Менеджер по логистике", company: "СДЭК", salary: "90 000 – 140 000 ₽", highlights: "Гибкий график, обучение, ДМС", responses: 178 },
  ],
  "Строительство": [
    { title: "Прораб на жилищное строительство", company: "ПИК", salary: "150 000 – 220 000 ₽", highlights: "Объекты в Москве, ДМС, премии по проектам", responses: 87 },
    { title: "Инженер-сметчик", company: "Самолёт", salary: "120 000 – 180 000 ₽", highlights: "Гибридный график, обучение, стабильная компания", responses: 112 },
    { title: "Главный инженер проекта", company: "Эталон", salary: "200 000 – 350 000 ₽", highlights: "Крупные проекты, авто, ДМС для семьи", responses: 64 },
  ],
  "Розница": [
    { title: "Управляющий магазином", company: "Магнит", salary: "80 000 – 130 000 ₽", highlights: "Бонус за KPI, карьерный рост, ДМС", responses: 245 },
    { title: "Территориальный менеджер", company: "X5 Group", salary: "120 000 – 180 000 ₽", highlights: "Авто, мобильная связь, годовой бонус", responses: 167 },
    { title: "Категорийный менеджер", company: "Лента", salary: "140 000 – 200 000 ₽", highlights: "Управление ассортиментом, гибрид, ДМС", responses: 98 },
  ],
  "Металлоконструкции": [
    { title: "Инженер-конструктор КМ/КМД", company: "СтальПроект", salary: "120 000 – 200 000 ₽", highlights: "Tekla, AutoCAD, интересные проекты, ДМС", responses: 56 },
    { title: "Руководитель производства", company: "МеталлСтрой", salary: "180 000 – 280 000 ₽", highlights: "Управление цехом, KPI-бонусы, стабильность", responses: 43 },
    { title: "Менеджер по продажам МК", company: "НЗМК", salary: "100 000 – 180 000 ₽", highlights: "% от продаж, обучение продукту, ДМС", responses: 89 },
  ],
}
const defaultExamples = examplesByCategory["Продажи"]

export function StepMarket({ draft, onChange }: Props) {
  const market = marketData[draft.category] || marketData["Продажи"]
  const midSalary = Math.round((draft.salaryMin + draft.salaryMax) / 2)
  const examples = examplesByCategory[draft.sidebarSection] || examplesByCategory[draft.category] || defaultExamples

  const prediction = useMemo(() => {
    const ratio = midSalary / market.median
    if (ratio < 0.7) return { responses: "~15", label: "мало", color: "text-destructive" }
    if (ratio < 0.9) return { responses: "~50", label: "ниже среднего", color: "text-warning" }
    if (ratio < 1.1) return { responses: "~120", label: "рыночная", color: "text-success" }
    if (ratio < 1.3) return { responses: "~200", label: "выше рынка", color: "text-success" }
    return { responses: "~300+", label: "премиум", color: "text-success" }
  }, [midSalary, market.median])

  const zone = useMemo(() => {
    const ratio = midSalary / market.median
    if (ratio < 0.8) return { label: "Красная зона", desc: "Зарплата значительно ниже рынка — мало откликов", color: "bg-red-500/10 border-red-200 text-red-700 dark:text-red-400" }
    if (ratio < 1.0) return { label: "Жёлтая зона", desc: "Зарплата чуть ниже рынка — средний поток", color: "bg-amber-500/10 border-amber-200 text-amber-700 dark:text-amber-400" }
    return { label: "Зелёная зона", desc: "Конкурентная зарплата — максимум откликов", color: "bg-emerald-500/10 border-emerald-200 text-emerald-700 dark:text-emerald-400" }
  }, [midSalary, market.median])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Анализ рынка</h2>
        <p className="text-sm text-muted-foreground">
          Данные по категории «{draft.category || "Продажи"}» в регионе «{draft.city || "Москва"}»
        </p>
      </div>

      {/* Median */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Медианная зарплата по рынку</p>
              <p className="text-2xl font-bold text-foreground">{market.median.toLocaleString("ru-RU")} ₽</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Мин: {market.min.toLocaleString("ru-RU")} ₽</span>
            <span className="text-border">|</span>
            <span>Макс: {market.max.toLocaleString("ru-RU")} ₽</span>
          </div>
        </CardContent>
      </Card>

      {/* Salary slider */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Ваша зарплатная вилка</p>
            <p className="text-sm font-bold text-foreground">
              {draft.salaryMin.toLocaleString("ru-RU")} – {draft.salaryMax.toLocaleString("ru-RU")} ₽
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">От</label>
              <Slider
                value={[draft.salaryMin]}
                onValueChange={([v]) => onChange({ ...draft, salaryMin: v })}
                min={30000}
                max={400000}
                step={5000}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">До</label>
              <Slider
                value={[draft.salaryMax]}
                onValueChange={([v]) => onChange({ ...draft, salaryMax: v })}
                min={30000}
                max={400000}
                step={5000}
              />
            </div>
          </div>

          {/* Prediction */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Прогноз откликов в неделю:</span>
            </div>
            <span className={cn("text-lg font-bold", prediction.color)}>{prediction.responses}</span>
          </div>

          {/* Zone */}
          <div className={cn("p-3 rounded-lg border", zone.color)}>
            <p className="text-sm font-semibold">{zone.label}</p>
            <p className="text-xs mt-0.5 opacity-80">{zone.desc}</p>
          </div>
        </CardContent>
      </Card>

      {/* Example vacancies */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          Топ-3 похожих вакансий на рынке
        </h3>
        <div className="space-y-3">
          {examples.map((v, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{v.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.company}</p>
                    <p className="text-sm font-medium text-foreground mt-1">{v.salary}</p>
                    <p className="text-xs text-muted-foreground mt-1">{v.highlights}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-4">
                    <Badge variant="secondary" className="text-[10px]">
                      {v.responses} откликов
                    </Badge>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
