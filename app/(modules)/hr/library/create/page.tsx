"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS } from "@/lib/demo-types"
import type { DemoLength } from "@/lib/demo-types"

// ─── Options ────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  "Продажи", "Маркетинг", "IT / разработка", "Логистика", "Производство",
  "Клиентский сервис", "HR", "Финансы", "Рабочие специальности", "Другое",
]

const MARKET_TYPES = ["B2B", "B2C", "B2G", "Внутренний"]

const LEVELS = ["Линейный", "Старший / ведущий", "Руководитель"]

const TEMPLATES = [
  { id: "empty", name: "Пустая демонстрация", desc: "Начать с нуля", department: null as string | null, market: null as string | null, subblocks: 0 },
  { id: "b2b", name: "Менеджер по продажам B2B", desc: "20 подблоков, стандартная", department: "Продажи", market: "B2B", subblocks: 20 },
]

// ─── Pill component ─────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 px-4 rounded-full text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-background border border-border text-foreground hover:border-primary/50",
      )}
    >
      {label}
    </button>
  )
}

// ─── Section header ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{children}</p>
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CreateDemoPage() {
  const router = useRouter()

  // 1. Position name
  const [positionName, setPositionName] = useState("")
  // 2. Department
  const [department, setDepartment] = useState<string | null>(null)
  // 3. Market type
  const [marketType, setMarketType] = useState<string | null>(null)
  // 4. Level
  const [level, setLevel] = useState<string | null>(null)
  // 5. Format
  const [selectedLength, setSelectedLength] = useState<DemoLength>("standard")
  // 6. Template
  const [selectedTemplate, setSelectedTemplate] = useState("empty")
  // 7. Demo name
  const [demoName, setDemoName] = useState("")

  const lengthKeys = Object.keys(LENGTH_LABELS) as DemoLength[]

  // Filter templates by department + market
  const filteredTemplates = TEMPLATES.filter((t) => {
    if (t.id === "empty") return true
    if (t.department && department && t.department !== department) return false
    if (t.market && marketType && t.market !== marketType) return false
    return true
  })

  // Auto-select matching template
  useEffect(() => {
    const match = filteredTemplates.find((t) => t.id !== "empty")
    setSelectedTemplate(match ? match.id : "empty")
  }, [department, marketType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill demo name
  useEffect(() => {
    if (positionName && !demoName) {
      setDemoName(`Демонстрация: ${positionName} — {{компания}}`)
    }
  }, [positionName]) // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = positionName.trim() && department && selectedLength

  const handleCreate = () => {
    if (!canCreate) return
    const name = demoName.trim() || `Демонстрация: ${positionName}`
    const params = new URLSearchParams({
      length: selectedLength,
      department: department!,
      ...(marketType ? { market: marketType } : {}),
      ...(level ? { level } : {}),
      template: selectedTemplate,
      name,
      position: positionName.trim(),
    })
    router.push(`/hr/library/create/editor?${params.toString()}`)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Header */}
              <div>
                <h1 className="text-xl font-semibold">Новая демонстрация</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Заполните параметры — чем точнее, тем лучше подберётся шаблон</p>
              </div>

              {/* ═══ 1. Название должности ═══ */}
              <div>
                <SectionLabel>Должность</SectionLabel>
                <Input
                  value={positionName}
                  onChange={(e) => setPositionName(e.target.value)}
                  placeholder="Например: Менеджер по продажам, Оператор колл-центра"
                  className="h-10 bg-[var(--input-bg)]"
                />
              </div>

              {/* ═══ 2. Отдел ═══ */}
              <div>
                <SectionLabel>Отдел</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map((d) => (
                    <Pill key={d} label={d} active={department === d} onClick={() => setDepartment(department === d ? null : d)} />
                  ))}
                </div>
              </div>

              {/* ═══ 3. Тип рынка ═══ */}
              <div>
                <SectionLabel>Тип рынка</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {MARKET_TYPES.map((m) => (
                    <Pill key={m} label={m} active={marketType === m} onClick={() => setMarketType(marketType === m ? null : m)} />
                  ))}
                </div>
              </div>

              {/* ═══ 4. Уровень ═══ */}
              <div>
                <SectionLabel>Уровень</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((l) => (
                    <Pill key={l} label={l} active={level === l} onClick={() => setLevel(level === l ? null : l)} />
                  ))}
                </div>
              </div>

              {/* ═══ 5. Формат ═══ */}
              <div>
                <SectionLabel>Формат</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                  {lengthKeys.map((key) => {
                    const l = LENGTH_LABELS[key]
                    const active = selectedLength === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedLength(key)}
                        className={cn(
                          "rounded-lg p-4 text-left cursor-pointer transition-all duration-200 h-[72px] flex flex-col justify-center",
                          active
                            ? "border-2 border-primary bg-primary/5 shadow-sm"
                            : "border border-border hover:border-primary/50",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base leading-none">{l.emoji}</span>
                          <span className="text-sm font-semibold">{l.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{l.time} · {l.subblocks} блоков</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ═══ 6. Основа (шаблон) ═══ */}
              <div>
                <SectionLabel>Основа</SectionLabel>
                <div className="space-y-2">
                  {filteredTemplates.map((t) => {
                    const active = selectedTemplate === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplate(t.id)}
                        className={cn(
                          "w-full rounded-lg p-3 text-left cursor-pointer transition-all duration-200 flex items-center gap-3",
                          active
                            ? "border-2 border-primary bg-primary/5 shadow-sm"
                            : "border border-border hover:border-primary/50",
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                          active ? "border-primary" : "border-muted-foreground/30",
                        )}>
                          {active && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ═══ 7. Название демонстрации ═══ */}
              <div>
                <SectionLabel>Название</SectionLabel>
                <Input
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  placeholder={positionName ? `Демонстрация: ${positionName} — {{компания}}` : "Демонстрация: Менеджер по продажам — {{компания}}"}
                  className="h-10 bg-[var(--input-bg)]"
                />
                <p className="text-xs text-muted-foreground mt-1">Можно оставить пустым — заполнится автоматически</p>
              </div>

              {/* ═══ Create button ═══ */}
              <div className="flex justify-end pt-2 pb-4">
                <Button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className="h-10 px-6 gap-2"
                >
                  Создать демонстрацию
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
