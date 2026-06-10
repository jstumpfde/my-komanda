"use client"

// Левое боковое меню единой платформенной панели администратора.
// Встраивается ВНУТРИ main (не заменяет DashboardSidebar).
// Группы: Обзор / Клиенты / Тарифы и модули / Шаблоны / Операции / Инфраструктура / Настройки.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Building2, Package, Library, ShieldAlert, Shield, Handshake,
  Inbox, Bot, BookOpen, Activity, Wrench, Palette, type LucideIcon,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Обзор",
    items: [
      { label: "Дашборд",        href: "/admin/dashboard",                  icon: LayoutDashboard },
    ],
  },
  {
    title: "Клиенты",
    items: [
      { label: "Компании",           href: "/admin/clients",              icon: Building2  },
      { label: "Запросы на email",   href: "/admin/requests",             icon: Inbox      },
      { label: "Интеграторы",        href: "/admin/integrators",          icon: Handshake  },
    ],
  },
  {
    title: "Тарифы и модули",
    items: [
      { label: "Тарифные планы",  href: "/admin/plans",                    icon: Package    },
    ],
  },
  {
    title: "Шаблоны и AI",
    items: [
      { label: "Шаблоны воронок",  href: "/admin/platform/templates",      icon: Library    },
      { label: "Юлия",             href: "/admin/platform/yulia",          icon: Bot        },
    ],
  },
  {
    title: "Платформа",
    items: [
      { label: "Компании (AI)",    href: "/admin/platform/companies",      icon: Building2  },
      { label: "AI вакансии",      href: "/admin/platform/vacancies",      icon: BookOpen   },
      { label: "Emergency",        href: "/admin/platform/emergency",      icon: ShieldAlert },
      { label: "Логи действий",    href: "/admin/platform/logs",           icon: Activity   },
      { label: "Миграции",         href: "/admin/platform/migrations",     icon: Wrench     },
    ],
  },
  {
    title: "Инфраструктура",
    items: [
      { label: "Сроки / health",   href: "/admin/platform/deadlines",     icon: Activity   },
      { label: "Cron-запуски",     href: "/admin/platform/cron",          icon: Wrench     },
      { label: "Присутствие",      href: "/admin/platform/presence",      icon: LayoutDashboard },
    ],
  },
  {
    title: "Настройки",
    items: [
      { label: "Брендинг и SEO",   href: "/admin/platform/branding",      icon: Palette    },
      { label: "Роли и доступ",    href: "/admin/roles",                   icon: Shield     },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/dashboard") return pathname === "/admin/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="w-52 shrink-0 border-r border-border bg-background py-4 overflow-y-auto">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-4">
          <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.title}
          </p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "")} />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
