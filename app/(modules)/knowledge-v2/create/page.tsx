"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
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
      { emoji: "👋", title: "Презентация должности", desc: "Для кандидатов",          href: "/knowledge-v2/create/demo" },
      { emoji: "🚀", title: "Онбординг",             desc: "Адаптация новичков",       href: null },
      { emoji: "🎓", title: "Обучающий курс",        desc: "С тестами и заданиями",    href: null },
      { emoji: "📝", title: "Скрипт",                desc: "Продажи, звонки, переговоры", href: null },
      { emoji: "🎯", title: "Аттестация",            desc: "Тесты знаний",             href: null },
      { emoji: "📊", title: "Оценка 360°",           desc: "Обратная связь",           href: null },
    ],
  },
  {
    label: "Документы и регламенты",
    cards: [
      { emoji: "📋", title: "Регламент",              desc: "Правила и политики",       href: null },
      { emoji: "📄", title: "Инструкция",             desc: "Пошаговые гайды (SOP)",    href: null },
      { emoji: "📑", title: "Шаблон документа",       desc: "Договоры, акты, формы",    href: null },
      { emoji: "💼", title: "Должностная инструкция", desc: "Описание ролей",           href: null },
      { emoji: "🔒", title: "Политика безопасности",  desc: "ИБ и доступы",             href: null },
    ],
  },
  {
    label: "Знания и контент",
    cards: [
      { emoji: "📚", title: "Статья",       desc: "Материалы и FAQ",      href: "/knowledge-v2/create/article" },
      { emoji: "💡", title: "Кейс",         desc: "Истории успеха",       href: null },
      { emoji: "📰", title: "Новость",      desc: "Внутренние новости",   href: null },
      { emoji: "🎬", title: "Видеоурок",    desc: "Видеоконтент",         href: null },
      { emoji: "❓", title: "FAQ",          desc: "Вопросы и ответы",     href: null },
      { emoji: "📖", title: "Wiki",         desc: "Справочник терминов",  href: null },
    ],
  },
  {
    label: "Для клиентов",
    cards: [
      { emoji: "📘", title: "Руководство",         desc: "Как пользоваться продуктом", href: null },
      { emoji: "🛠", title: "Troubleshooting",     desc: "Решение проблем",            href: null },
      { emoji: "📦", title: "Описание продукта",   desc: "Каталог продуктов",          href: null },
      { emoji: "🎥", title: "Видео-инструкция",    desc: "Обучающее видео",            href: null },
    ],
  },
]

function Card({ card }: { card: TypeCard }) {
  const disabled = card.href === null
  const body = (
    <div
      className={cn(
        "relative h-20 rounded-lg border border-border p-3 flex items-start gap-2 transition",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:border-primary hover:shadow-sm",
      )}
    >
      {disabled && (
        <span className="absolute top-1 right-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[9px] px-1.5 py-0.5 rounded-full font-medium">
          Скоро
        </span>
      )}
      <div className="text-xl leading-none flex-shrink-0">{card.emoji}</div>
      <div className="flex flex-col min-w-0">
        <div className="text-xs font-semibold leading-tight pr-10">{card.title}</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{card.desc}</div>
      </div>
    </div>
  )
  return disabled ? <div>{body}</div> : <Link href={card.href!}>{body}</Link>
}

function CustomCard() {
  return (
    <div
      className={cn(
        "relative h-20 rounded-lg border-2 border-dashed border-border p-3 flex items-start gap-2 transition cursor-not-allowed",
        "hover:border-primary",
      )}
    >
      <span className="absolute top-1 right-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[9px] px-1.5 py-0.5 rounded-full font-medium">
        Скоро
      </span>
      <div className="text-xl leading-none flex-shrink-0 text-muted-foreground">
        <Plus className="w-5 h-5" />
      </div>
      <div className="flex flex-col min-w-0">
        <div className="text-xs font-semibold leading-tight pr-10">Добавить свой тип</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Создать свой формат материала</div>
      </div>
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
            <div className="max-w-5xl mx-auto">
              <div className="mb-5">
                <h1 className="text-xl font-semibold">Создать материал</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Выберите тип документа</p>
              </div>

              {GROUPS.map((group, i) => (
                <section key={group.label} className={cn(i === 0 ? "mt-0" : "mt-4")}>
                  <p className="uppercase text-[10px] font-semibold text-muted-foreground tracking-widest mb-2">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.cards.map((card) => (
                      <Card key={card.title} card={card} />
                    ))}
                  </div>
                </section>
              ))}

              <section className="mt-4">
                <p className="uppercase text-[10px] font-semibold text-muted-foreground tracking-widest mb-2">
                  Своё
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <CustomCard />
                </div>
              </section>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
