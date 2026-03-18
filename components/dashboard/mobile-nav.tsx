"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, UserPlus, Users, Calendar, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/overview", icon: LayoutDashboard, label: "Обзор" },
  { href: "/", icon: UserPlus, label: "Найм" },
  { href: "/candidates", icon: Users, label: "Кандидаты" },
  { href: "/interviews", icon: Calendar, label: "Интервью" },
  { href: "/settings/company", icon: MoreHorizontal, label: "Ещё" },
]

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t border-border">
      <div className="flex items-center justify-around h-[60px] px-1">
        {NAV_ITEMS.map(item => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors min-h-[44px]",
                isActive ? "text-[#C0622F]" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
