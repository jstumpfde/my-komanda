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

const TYPE_CARDS: TypeCard[] = [
  {
    emoji: "👋",
    title: "Демонстрация должности",
    desc: "Презентация компании и должности для кандидатов",
    href: "/knowledge-v2/create/demo",
  },
  {
    emoji: "📚",
    title: "Статья базы знаний",
    desc: "Обучающие материалы, инструкции, FAQ",
    href: "/knowledge-v2/create/article",
  },
  {
    emoji: "📋",
    title: "Регламент",
    desc: "Правила, процедуры, политики компании",
    href: null,
  },
  {
    emoji: "🎓",
    title: "Обучающий курс",
    desc: "Структурированное обучение с тестами",
    href: null,
  },
]

export default function KnowledgeV2CreatePage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl font-semibold">Создать материал</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Выберите тип документа</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {TYPE_CARDS.map((card) => {
                  const disabled = card.href === null
                  const content = (
                    <div
                      className={cn(
                        "h-40 rounded-xl border border-border p-6 flex flex-col justify-center gap-2 transition-all duration-200 relative",
                        disabled
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer hover:border-primary/50 hover:shadow-md",
                      )}
                    >
                      {disabled && (
                        <span className="absolute top-3 right-3 text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                          Скоро
                        </span>
                      )}
                      <div className="text-[32px] leading-none">{card.emoji}</div>
                      <div className="text-base font-bold">{card.title}</div>
                      <div className="text-sm text-muted-foreground">{card.desc}</div>
                    </div>
                  )
                  return disabled ? (
                    <div key={card.title}>{content}</div>
                  ) : (
                    <Link key={card.title} href={card.href!}>{content}</Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
