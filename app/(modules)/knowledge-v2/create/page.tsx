"use client"

import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface TypeCard {
  emoji: string
  title: string
  desc: string
  href: string | null
}

interface Group {
  label: string
  cards: TypeCard[]
}

const GROUPS: Group[] = [
  {
    label: "Найм и адаптация",
    cards: [
      { emoji: "👋", title: "Презентация должности", desc: "Для новых кандидатов",       href: "/knowledge-v2/create/demo" },
      { emoji: "🚀", title: "Онбординг",             desc: "Адаптация новых сотрудников", href: null },
      { emoji: "🎓", title: "Обучение",              desc: "Курсы для сотрудников",       href: null },
    ],
  },
  {
    label: "Документы",
    cards: [
      { emoji: "📋", title: "Регламент",         desc: "Правила и процедуры",   href: null },
      { emoji: "📄", title: "Инструкция",        desc: "Пошаговые гайды",       href: null },
      { emoji: "📑", title: "Шаблон документа",  desc: "Договоры, акты, формы", href: null },
    ],
  },
  {
    label: "Знания и контент",
    cards: [
      { emoji: "📚", title: "Статья",  desc: "Обучающие материалы, FAQ",      href: "/knowledge-v2/create/article" },
      { emoji: "💡", title: "Кейс",    desc: "Истории успеха, разборы",       href: null },
      { emoji: "📰", title: "Новость", desc: "Внутренние новости компании",   href: null },
    ],
  },
]

function CardContent({ card, disabled }: { card: TypeCard; disabled: boolean }) {
  return (
    <div
      className={cn(
        "relative h-28 rounded-xl border border-border p-4 flex flex-col items-start gap-1 transition",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-primary hover:shadow-md",
      )}
    >
      {disabled && (
        <span className="absolute top-2 right-2 bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">
          Скоро
        </span>
      )}
      <div className="text-2xl leading-none">{card.emoji}</div>
      <div className="text-sm font-semibold">{card.title}</div>
      <div className="text-xs text-muted-foreground">{card.desc}</div>
    </div>
  )
}

export default function KnowledgeV2CreatePage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-4xl mx-auto space-y-8">
              <div>
                <h1 className="text-xl font-semibold">Создать материал</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Выберите тип документа</p>
              </div>

              {GROUPS.map((group) => (
                <section key={group.label}>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {group.cards.map((card) => {
                      const disabled = card.href === null
                      return disabled ? (
                        <div key={card.title}>
                          <CardContent card={card} disabled />
                        </div>
                      ) : (
                        <Link key={card.title} href={card.href!}>
                          <CardContent card={card} disabled={false} />
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
