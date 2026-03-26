"use client"

import { Button } from "@/components/ui/button"
import { Bell, Moon, Sun, Coffee, LogOut, PanelLeftClose, PanelLeft, ChevronDown, ArrowLeft } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useSidebar } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { useAuth, ROLE_LABELS, ROLE_ICONS, type UserRole } from "@/lib/auth"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Notification {
  id: string; text: string; time: string; color: string; read: boolean
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: "n1", text: "Иванов А. завершил демонстрацию (94%)", time: "5 мин назад", color: "bg-emerald-500", read: false },
  { id: "n2", text: "Смирнова Е. выбрала слот: завтра 14:00", time: "12 мин назад", color: "bg-blue-500", read: false },
  { id: "n3", text: "Козлов И. не пришёл на интервью", time: "1 час назад", color: "bg-red-500", read: false },
  { id: "n4", text: "3 новых кандидата ожидают решения HR", time: "2 часа назад", color: "bg-amber-500", read: false },
  { id: "n5", text: "Петрова О. ответила на сообщение в hh-чат", time: "3 часа назад", color: "bg-blue-500", read: true },
  { id: "n6", text: "Новый отклик с hh.ru: Морозов С.", time: "5 часов назад", color: "bg-emerald-500", read: true },
]

const ALL_ROLES: UserRole[] = ["admin", "manager", "client", "client_hr", "candidate"]

export function DashboardHeader() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { state, toggleSidebar } = useSidebar()
  const { user, role, isViewingAs, setRole, returnToAdmin } = useAuth()
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS)
  const router = useRouter()

  const unreadCount = notifications.filter(n => !n.read).length
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); toggleSidebar() }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const handleRoleSwitch = (r: UserRole) => {
    if (r === "candidate") {
      window.open("/candidate/abc123xyz789", "_blank")
      return
    }
    setRole(r)
    if (r === "admin") router.push("/overview")
    else if (r === "manager") router.push("/overview")
    else router.push("/")
  }

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  if (!mounted) return null

  return (
    <>
      {/* View-as banner */}
      {isViewingAs && (
        <div className="bg-amber-400 text-amber-950 px-4 py-1.5 flex items-center justify-between text-sm">
          <span className="font-medium">
            {ROLE_ICONS[role]} Вы просматриваете платформу как: <strong>{ROLE_LABELS[role]}</strong>
            {user.company && <span className="opacity-70"> · {user.company}</span>}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white/80 border-amber-600 text-amber-900 hover:bg-white gap-1" onClick={returnToAdmin}>
            <ArrowLeft className="w-3 h-3" /> Вернуться к Admin
          </Button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex items-center justify-between h-14 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={toggleSidebar}>
            {state === "expanded" ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
          </Button>

          <div className="flex items-center gap-2">
            {/* Role Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <span>{ROLE_ICONS[role]}</span>
                  <span className="hidden sm:inline">{ROLE_LABELS[role]}</span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {ALL_ROLES.map((r, i) => {
                  const isSep = (i === 1 || i === 3)
                  return (
                    <div key={r}>
                      {isSep && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        className={cn("gap-2 cursor-pointer", role === r && "bg-primary/5")}
                        onClick={() => handleRoleSwitch(r)}
                      >
                        <span className="text-base">{ROLE_ICONS[r]}</span>
                        <span className="flex-1 text-sm">{ROLE_LABELS[r]}</span>
                        {role === r && <Badge variant="secondary" className="text-[9px] h-4 px-1">текущая</Badge>}
                        {r === "candidate" && <span className="text-[10px] text-muted-foreground">(новая вкладка)</span>}
                      </DropdownMenuItem>
                    </div>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Switcher */}
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

            {/* Notifications */}
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

            {/* User Avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-3 p-3 border-b">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    <Badge variant="secondary" className="text-[10px] mt-1 h-4 px-1.5">{ROLE_LABELS[role]}</Badge>
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
      </header>
    </>
  )
}
