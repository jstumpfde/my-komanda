"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Building2, User, Users, CreditCard, Plug, Clock, Bell } from "lucide-react"

// IA-рефактор (D8): настройки сгруппированы в 4 раздела.
// Первый проход — только пункты текущего /settings. Дальше сюда же переедут
// «Дефолты вакансии» (расписание/воронка/стоп-факторы из hiring-settings) и
// «Служебные» (хранение ПДн, корзина). Роуты пока не меняются.
const navGroups: { label: string; items: { href: string; label: string; icon: typeof Building2 }[] }[] = [
  {
    label: "Профиль и компания",
    items: [
      { href: "/settings/company", label: "Компания", icon: Building2 },
      { href: "/settings/profile", label: "Профиль", icon: User },
      { href: "/settings/team", label: "Команда", icon: Users },
    ],
  },
  {
    label: "Интеграции",
    items: [
      { href: "/settings/integrations", label: "Интеграции", icon: Plug },
    ],
  },
  {
    label: "Дефолты вакансии",
    items: [
      { href: "/settings/schedule", label: "Расписание", icon: Clock },
    ],
  },
  {
    label: "Служебные",
    items: [
      { href: "/settings/notifications", label: "Уведомления", icon: Bell },
      { href: "/settings/billing", label: "Тариф и оплата", icon: CreditCard },
    ],
  },
]

export function SettingsNavigation() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap items-end gap-x-5 gap-y-3 mb-6 pb-2 border-b">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55 px-1">
            {group.label}
          </span>
          <div className="flex items-center gap-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
