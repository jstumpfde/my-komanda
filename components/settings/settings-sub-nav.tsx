"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Building2, User, CreditCard, Users, Plug, Clock, Bell } from "lucide-react"

const navItems = [
  { href: "/settings/company", label: "Компания", icon: Building2 },
  { href: "/settings/profile", label: "Профиль", icon: User },
  { href: "/settings/team", label: "Команда", icon: Users },
  { href: "/settings/billing", label: "Тариф", icon: CreditCard },
  { href: "/settings/integrations", label: "Интеграции", icon: Plug },
  { href: "/settings/schedule", label: "Расписание", icon: Clock },
  { href: "/settings/notifications", label: "Уведомления", icon: Bell },
]

export function SettingsSubNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
