"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface TypePill {
  emoji: string
  title: string
  href: string | null
}

interface Group {
  emoji: string
  label: string
  items: TypePill[]
}

const GROUPS: Group[] = [
  {
    emoji: "👥",
    label: "Найм и адаптация",
    items: [
      { emoji: "👋", title: "Презентация должности", href: "/knowledge-v2/create/demo" },
      { emoji: "🚀", title: "Онбординг",             href: null },
      { emoji: "🎓", title: "Обучающий курс",        href: null },
      { emoji: "🎬", title: "Видеоурок",             href: null },
      { emoji: "📝", title: "Скрипт",                href: null },
      { emoji: "🎯", title: "Аттестация",            href: null },
      { emoji: "📊", title: "Оценка 360°",           href: null },
    ],
  },
  {
    emoji: "📋",
    label: "Документы",
    items: [
      { emoji: "📋", title: "Регламент",     href: null },
      { emoji: "📄", title: "Инструкция",    href: null },
      { emoji: "📑", title: "Шаблон",        href: null },
      { emoji: "💼", title: "Должностная",   href: null },
    ],
  },
  {
    emoji: "📚",
    label: "Знания",
    items: [
      { emoji: "📚", title: "Статья",     href: "/knowledge-v2/create/article" },
      { emoji: "💡", title: "Кейс",       href: null },
      { emoji: "📰", title: "Новость",    href: null },
      { emoji: "🎬", title: "Видеоурок",  href: null },
      { emoji: "❓", title: "FAQ",        href: null },
      { emoji: "📖", title: "Wiki",       href: null },
    ],
  },
  {
    emoji: "🤝",
    label: "Для клиентов",
    items: [
      { emoji: "📘", title: "Руководство",       href: null },
      { emoji: "🛠", title: "Решение проблем",   href: null },
      { emoji: "📦", title: "Продукт",           href: null },
      { emoji: "🎥", title: "Видео",             href: null },
    ],
  },
]

function Pill({ item }: { item: TypePill }) {
  const disabled = item.href === null
  const body = (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 px-5 py-[18px] rounded-xl border border-border bg-card transition",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:border-primary hover:shadow-sm",
      )}
    >
      <span className="text-xl leading-none">{item.emoji}</span>
      <span className="text-sm font-medium">{item.title}</span>
      {disabled && (
        <span className="ml-1 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
          Скоро
        </span>
      )}
    </div>
  )
  return disabled ? body : <Link href={item.href!}>{body}</Link>
}

export default function KnowledgeV2CreatePage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-5xl mx-auto">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Создать материал</h1>
                <p className="text-sm text-muted-foreground mt-1">Выберите тип документа</p>
              </div>

              <div className="space-y-6">
                {GROUPS.map((group) => (
                  <section key={group.label}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl leading-none">{group.emoji}</span>
                      <span className="text-base font-semibold">{group.label}</span>
                      <span className="flex-1 h-px bg-border" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {group.items.map((item) => (
                        <Pill key={item.title} item={item} />
                      ))}
                    </div>
                  </section>
                ))}

                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center justify-center gap-2 py-5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer transition"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-sm font-medium">Добавить свой тип материала</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
