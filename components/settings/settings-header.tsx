"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Coffee, PanelLeftClose, PanelLeft, Bell, Building2, CreditCard, Users, Plug, Clock, User, LogOut, Palette } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const navItems = [
  { href: "/settings/company",       label: "Компания",    icon: Building2 },
  { href: "/settings/profile",       label: "Профиль",     icon: User },
  { href: "/settings/team",          label: "Команда",     icon: Users },
  { href: "/settings/billing",       label: "Тариф и оплата", icon: CreditCard },
  { href: "/settings/integrations",  label: "Интеграции",  icon: Plug },
  { href: "/settings/schedule",      label: "Расписание",  icon: Clock },
  { href: "/settings/notifications", label: "Уведомления", icon: Bell },
  { href: "/settings/branding",      label: "Брендинг",    icon: Palette },
]

const NOTIFICATIONS = [
  { id: "n1", text: "Иванов А. завершил демонстрацию (94%)", time: "5 мин назад", color: "bg-emerald-500", read: false },
  { id: "n2", text: "Смирнова Е. выбрала слот: завтра 14:00", time: "12 мин назад", color: "bg-blue-500", read: false },
  { id: "n3", text: "Козлов И. не пришёл на интервью", time: "1 час назад", color: "bg-red-500", read: false },
  { id: "n4", text: "3 новых кандидата ожидают решения HR", time: "2 часа назад", color: "bg-amber-500", read: false },
]

export function SettingsHeader() {
  const { theme, setTheme } = useTheme()
  const { state, toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const { user } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState(NOTIFICATIONS)

  useEffect(() => { setMounted(true) }, [])

  const unreadCount = notifications.filter(n => !n.read).length
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  return (
    <header className="sticky top-0 z-40 bg-background">
      {/* Row 1: Top bar */}
      <div className="flex items-center justify-between h-14 border-b border-border" style={{ paddingLeft: 56, paddingRight: 56 }}>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={toggleSidebar}>
          {state === "expanded" ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
        </Button>

        <div className="flex items-center gap-2">
          {mounted && (
            <div className="hidden md:flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant={theme === "light" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTheme("light")} title="Светлая" style={theme === "light" ? { backgroundColor: "#C0622F", color: "#fff" } : undefined}>
                <Sun className="h-4 w-4" />
              </Button>
              <Button variant={theme === "dark" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTheme("dark")} title="Тёмная" style={theme === "dark" ? { backgroundColor: "#C0622F", color: "#fff" } : undefined}>
                <Moon className="h-4 w-4" />
              </Button>
              <Button variant={theme === "warm" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTheme("warm")} title="Кофе" style={theme === "warm" ? { backgroundColor: "#C0622F", color: "#fff" } : undefined}>
                <Coffee className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{unreadCount}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-semibold text-foreground">Уведомления</span>
                {unreadCount > 0 && <button className="text-xs text-primary hover:underline" onClick={markAllRead}>Прочитать все</button>}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.map(n => (
                  <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30", !n.read && "bg-primary/5")}>
                    <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", n.color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.read ? "text-foreground font-medium" : "text-muted-foreground")}>{n.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-2.5">
                <Link href="/settings/notifications" className="text-xs text-primary hover:underline">Все уведомления →</Link>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto gap-2 rounded-full px-2 py-1">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium text-foreground">{user?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center gap-3 p-3 border-b">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuItem className="text-sm" asChild><Link href="/settings/profile">Профиль</Link></DropdownMenuItem>
              <DropdownMenuItem className="text-sm" asChild><Link href="/settings/company">Настройки</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-sm cursor-pointer"><LogOut className="w-4 h-4 mr-2" />Выход</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: Settings tabs */}
      <div className="border-b border-border overflow-x-auto">
        <nav className="flex items-center gap-0.5" style={{ paddingLeft: 56, paddingRight: 56 }}>
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
    </header>
  )
}
