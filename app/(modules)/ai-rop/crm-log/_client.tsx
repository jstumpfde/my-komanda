"use client"

// Фильтр «Режим» (Все/Боевой/Тестовый) — пишет ?mode= в query, страница
// server component перечитывает данные при смене URL (тот же паттерн, что
// DashboardFilters/DiscrepancyFilters).
import { useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function ModeFilter({ mode }: { mode: string }) {
  const router = useRouter()

  function navigate(next: string) {
    const params = new URLSearchParams()
    if (next !== "all") params.set("mode", next)
    router.push(`/ai-rop/crm-log${params.toString() ? `?${params}` : ""}`)
  }

  return (
    <Tabs value={mode} onValueChange={navigate} className="mb-4">
      <TabsList>
        <TabsTrigger value="all">Все</TabsTrigger>
        <TabsTrigger value="live">Боевой</TabsTrigger>
        <TabsTrigger value="dry">Тестовый</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
