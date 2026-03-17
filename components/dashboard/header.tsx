"use client"

import { Button } from "@/components/ui/button"
import { CommandPalette } from "./command-palette"
import { Bell, Moon, Sun, Coffee, LogOut, PanelLeftClose, PanelLeft, Search, Circle } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSidebar } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { useAuth, ROLE_LABELS, type UserRole } from "@/lib/auth"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  text: string
  time: string
  color: string
  read: boolean
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: "n1", text: "Иванов А. завершил демонстрацию (94%)", time: "5 мин назад", color: "bg-emerald-500", read: false },
  { id: "n2", text: "Смирнова Е. выбрала слот: завтра 14:00", time: "12 мин назад", color: "bg-blue-500", read: false },
  { id: "n3", text: "Козлов И. не пришёл на интервью", time: "1 час назад", color: "bg-red-500", read: false },
  { id: "n4", text: "3 новых кандидата ожидают решения HR", time: "2 часа назад", color: "bg-amber-500", read: false },
  { id: "n5", text: "Петрова О. ответила на сообщение в hh-чат", time: "3 часа назад", color: "bg-blue-500", read: true },
  { id: "n6", text: "Новый отклик с hh.ru: Морозов С.", time: "5 часов назад", color: "bg-emerald-500", read: true },
]

export function DashboardHeader() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { state, toggleSidebar } = useSidebar()
  const { user, role, setRole } = useAuth()
  const roles: UserRole[] = ["admin", "manager", "client"]
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS)

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  if (!mounted) return null

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between h-16 px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={toggleSidebar}
        >
          {state === "expanded" ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeft className="h-5 w-5" />
          )}
        </Button>

        <div className="flex items-center gap-2">
          <CommandPalette />

          {/* Role Switcher (demo) */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {roles.map((r) => (
              <Button
                key={r}
                variant={role === r ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setRole(r)}
              >
                {ROLE_LABELS[r]}
              </Button>
            ))}
          </div>

          {/* Theme Switcher */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button variant={theme === "light" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTheme("light")} title="Светлая тема">
              <Sun className="h-4 w-4" />
            </Button>
            <Button variant={theme === "dark" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTheme("dark")} title="Тёмная тема">
              <Moon className="h-4 w-4" />
            </Button>
            <Button variant={theme === "warm" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTheme("warm")} title="Тёплая тема">
              <Coffee className="h-4 w-4" />
            </Button>
          </div>

          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-semibold text-foreground">Уведомления</span>
                {unreadCount > 0 && (
                  <button className="text-xs text-primary hover:underline" onClick={markAllRead}>
                    Прочитать все
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors hover:bg-muted/30",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", n.color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.read ? "text-foreground font-medium" : "text-muted-foreground")}>{n.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-2.5">
                <Link href="/settings/notifications" className="text-xs text-primary hover:underline">
                  Все уведомления →
                </Link>
              </div>
            </PopoverContent>
          </Popover>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=HR" />
                  <AvatarFallback>HR</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center gap-3 p-3 border-b border-border">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">{user.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1 h-4 px-1.5">{ROLE_LABELS[role]}</Badge>
                </div>
              </div>
              <DropdownMenuItem className="text-sm">Профиль</DropdownMenuItem>
              <DropdownMenuItem className="text-sm">Настройки</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-sm cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" />
                Выход
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
