"use client"

import { Building2, CreditCard, Users, Plug, Clock, Bell, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { DashboardHeader } from "@/components/dashboard/header"

const navItems = [
  { href: "/settings/company",       label: "Компания",    icon: Building2 },
  { href: "/settings/profile",       label: "Профиль",     icon: User },
  { href: "/settings/team",          label: "Команда",     icon: Users },
  { href: "/settings/billing",       label: "Тариф",       icon: CreditCard },
  { href: "/settings/integrations",  label: "Интеграции",  icon: Plug },
  { href: "/settings/schedule",      label: "Расписание",  icon: Clock },
  { href: "/settings/notifications", label: "Уведомления", icon: Bell },
]

export function SettingsHeader() {
  const pathname = usePathname()

  return (
    <div className="sticky top-0 z-40 bg-background">
      <DashboardHeader />
      {/* Settings tabs */}
      <div className="border-b border-border overflow-x-auto">
        <nav className="flex items-center gap-0.5 px-4 sm:px-6">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                pathname === href
                  ? "text-primary border-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
