"use client"

import { useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronRight, Plus, Sparkles, BookOpen, FileText, Coins,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_PROJECTS = [
  {
    id: "proj-1",
    title: "Онбординг менеджеров",
    description: "Курс по адаптации новых менеджеров: процессы, инструменты, культура",
    status: "ready",
    sourcesCount: 4,
    lessonsCount: 8,
    tokensInput: 12450,
    tokensOutput: 3200,
    costUsd: "0.0535",
    createdAt: "2026-04-01T10:00:00Z",
  },
  {
    id: "proj-2",
    title: "Продуктовое обучение",
    description: "Знакомство с продуктом для новых сотрудников отдела продаж",
    status: "draft",
    sourcesCount: 2,
    lessonsCount: 0,
    tokensInput: 0,
    tokensOutput: 0,
    costUsd: "0",
    createdAt: "2026-04-03T14:30:00Z",
  },
  {
    id: "proj-3",
    title: "Безопасность на производстве",
    description: "Обязательный курс по ТБ: правила, инструкции, тесты",
    status: "published",
    sourcesCount: 6,
    lessonsCount: 12,
    tokensInput: 22800,
    tokensOutput: 5600,
    costUsd: "0.1524",
    createdAt: "2026-03-25T09:00:00Z",
  },
]

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:      { label: "Черновик",   className: "bg-muted text-muted-foreground" },
  generating: { label: "Генерация",  className: "bg-blue-500/15 text-blue-700 animate-pulse" },
  ready:      { label: "Готов",      className: "bg-emerald-500/15 text-emerald-700" },
  published:  { label: "Опубликован", className: "bg-violet-500/15 text-violet-700" },
}

function formatTokens(n: number): string {
  if (n === 0) return "0"
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiCoursesListPage() {
  const [projects] = useState(MOCK_PROJECTS)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/knowledge" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">AI-курсы</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-violet-500" />
                <h1 className="text-xl font-semibold">AI-курсы</h1>
              </div>
              <Link href="/knowledge/ai-courses/new">
                <Button className="gap-1.5">
                  <Plus className="size-4" />
                  Новый AI-курс
                </Button>
              </Link>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map((p) => {
                const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft
                return (
                  <Link
                    key={p.id}
                    href={`/knowledge/ai-courses/${p.id}`}
                    className="group block border rounded-xl p-5 bg-card transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1">
                        {p.title}
                      </h3>
                      <Badge variant="secondary" className={cn("text-[10px] shrink-0 ml-2", st.className)}>
                        {st.label}
                      </Badge>
                    </div>

                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-4">{p.description}</p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" />
                        {p.sourcesCount} источн.
                      </span>
                      {p.lessonsCount > 0 && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="size-3" />
                          {p.lessonsCount} уроков
                        </span>
                      )}
                      {Number(p.costUsd) > 0 && (
                        <span className="flex items-center gap-1">
                          <Coins className="size-3" />
                          {formatTokens(p.tokensInput + p.tokensOutput)} токенов · ${p.costUsd}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground">
                      {formatDate(p.createdAt)}
                    </div>
                  </Link>
                )
              })}
            </div>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
