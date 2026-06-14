"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { LayoutGrid, Briefcase, CalendarDays, Users, Library } from "lucide-react"
import { DashboardView } from "../dashboard/page"
import { VacanciesView } from "../vacancies/page"
import { TalentPoolView } from "../talent-pool/page"
import { InterviewsView } from "../interviews/page"
import { LibraryView } from "../library/page"

// «Рабочий стол» — единый экран-обзор HR с тремя табами:
//   Обзор (дашборд по всем вакансиям) / Вакансии (список) / Резерв.
// Встраивает существующие View-компоненты (embedded=true — без своих
// заголовков-дублей). Активный таб монтируется по одному и хранится в ?ws=.

const TABS = [
  { key: "overview",  label: "Обзор",    icon: LayoutGrid },
  { key: "vacancies", label: "Вакансии", icon: Briefcase },
  { key: "interviews", label: "Интервью", icon: CalendarDays },
  { key: "reserve",   label: "Резерв",   icon: Users },
  { key: "library",   label: "Библиотека", icon: Library },
] as const

type TabKey = (typeof TABS)[number]["key"]
const VALID = new Set<TabKey>(TABS.map((t) => t.key))

function WorkspaceInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams?.get("ws") as TabKey | null
    return t && VALID.has(t) ? t : "overview"
  })

  // Синхронизируем выбранный таб с ?ws= (без скролла), чтобы ссылка/обновление
  // сохраняли позицию.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get("ws") === tab) return
    sp.set("ws", tab)
    router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        {/* Шапка рабочего стола + таб-бар */}
        <div className="border-b bg-background px-4 sm:px-14 pt-5 pb-0">
          <h1 className="text-lg font-semibold mb-3">Рабочий стол</h1>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Контент активного таба — монтируется по одному */}
        {tab === "overview" && <DashboardView embedded />}
        {tab === "vacancies" && <VacanciesView embedded />}
        {tab === "interviews" && (
          <Suspense fallback={null}>
            <div className="px-4 sm:px-14 pt-4 pb-6">
              <InterviewsView embedded />
            </div>
          </Suspense>
        )}
        {tab === "reserve" && <TalentPoolView embedded />}
        {tab === "library" && <LibraryView embedded />}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function HrWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceInner />
    </Suspense>
  )
}
