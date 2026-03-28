"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Building2, Users, CreditCard, Plug, Clock, Bell, LayoutGrid } from "lucide-react"

const navItems = [
  { href: "/settings/company", label: "Компания", icon: Building2 },
  { href: "/settings/team", label: "Команда", icon: Users },
  { href: "/settings/plan", label: "Тариф", icon: LayoutGrid },
  { href: "/settings/billing", label: "Оплата", icon: CreditCard },
  { href: "/settings/integrations", label: "Интеграции", icon: Plug },
  { href: "/settings/schedule", label: "Расписание", icon: Clock },
  { href: "/settings/notifications", label: "Уведомления", icon: Bell },
]

export function SettingsNavigation() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1 border-b">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap transition-all border-b-2",
              active
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
