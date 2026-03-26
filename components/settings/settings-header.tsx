"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Coffee, PanelLeftClose, PanelLeft, Bell, Building2, CreditCard, Users, Plug, Clock } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"

const navItems = [
  { href: "/settings/company",       label: "Компания",    icon: Building2 },
  { href: "/settings/team",          label: "Команда",     icon: Users },
  { href: "/settings/billing",       label: "Тариф",       icon: CreditCard },
  { href: "/settings/integrations",  label: "Интеграции",  icon: Plug },
  { href: "/settings/schedule",      label: "Расписание",  icon: Clock },
  { href: "/settings/notifications", label: "Уведомления", icon: Bell },
]

export function SettingsHeader() {
  const { theme, setTheme } = useTheme()
  const { state, toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const { user } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between h-14 px-4 sm:px-6">

        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={toggleSidebar}>
          {state === "expanded" ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
        </Button>

        <nav className="hidden md:flex items-center gap-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                pathname === href
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {mounted && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={theme === "light" ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme("light")}
                title="Светлая"
              >
                <Sun className="h-4 w-4" />
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme("dark")}
                title="Тёмная"
              >
                <Moon className="h-4 w-4" />
              </Button>
              <Button
                variant={theme === "warm" ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme("warm")}
                title="Кофе"
              >
                <Coffee className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
        </div>
      </div>
    </header>
  )
}
