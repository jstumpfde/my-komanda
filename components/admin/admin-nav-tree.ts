// Единое дерево навигации админ-панели — источник правды для ДВУХ обвесов:
//   1) вертикальный сайдбар (components/admin/admin-nav.tsx) — показывает только
//      КАТЕГОРИИ;
//   2) горизонтальные табы (components/admin/admin-category-tabs.tsx) — показывают
//      ПУНКТЫ текущей категории (как на «Рабочем столе»).
// Пункт живёт ровно в одном месте — в табах своей категории, в сайдбаре НЕ
// дублируется (решение Юрия 17.06).

import {
  LayoutDashboard, Building2, Package, Library, ShieldAlert, Shield, Handshake,
  Inbox, Bot, BookOpen, Activity, Wrench, Palette, Sparkles, Settings,
  type LucideIcon,
} from "lucide-react"

export interface AdminNavItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface AdminNavCategory {
  title: string
  icon: LucideIcon
  items: AdminNavItem[]
}

export const ADMIN_NAV_TREE: AdminNavCategory[] = [
  {
    title: "Дашборд",
    icon: LayoutDashboard,
    items: [
      { label: "Дашборд", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Клиенты",
    icon: Building2,
    items: [
      { label: "Компании",         href: "/admin/clients",     icon: Building2 },
      { label: "Запросы на email",  href: "/admin/requests",    icon: Inbox     },
      { label: "Партнёры",          href: "/admin/integrators", icon: Handshake },
    ],
  },
  {
    title: "Тарифы и модули",
    icon: Package,
    items: [
      { label: "Тарифные планы", href: "/admin/plans", icon: Package },
    ],
  },
  {
    title: "Шаблоны и AI",
    icon: Library,
    items: [
      { label: "Шаблоны воронок", href: "/admin/platform/templates", icon: Library },
      { label: "Юлия",            href: "/admin/platform/yulia",     icon: Bot     },
    ],
  },
  {
    title: "Платформа",
    icon: Shield,
    items: [
      { label: "AI-мониторинг", href: "/admin/platform/companies",  icon: Bot        },
      { label: "AI вакансии",   href: "/admin/platform/vacancies",  icon: BookOpen   },
      { label: "Emergency",     href: "/admin/platform/emergency",  icon: ShieldAlert },
      { label: "Логи действий", href: "/admin/platform/logs",       icon: Activity   },
      { label: "Миграции",      href: "/admin/platform/migrations", icon: Wrench     },
      { label: "Демо-данные",   href: "/admin/platform/demo",       icon: Sparkles   },
    ],
  },
  {
    title: "Инфраструктура",
    icon: Activity,
    items: [
      { label: "Сроки / health", href: "/admin/platform/deadlines", icon: Activity        },
      { label: "Cron-запуски",   href: "/admin/platform/cron",      icon: Wrench          },
      { label: "Присутствие",    href: "/admin/platform/presence",  icon: LayoutDashboard },
    ],
  },
  {
    title: "Настройки",
    icon: Settings,
    items: [
      { label: "Брендинг и SEO", href: "/admin/platform/branding", icon: Palette },
      { label: "Роли и доступ",  href: "/admin/roles",             icon: Shield  },
    ],
  },
]

// Совпадение пути с пунктом (для подсветки активного таба/категории).
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin/dashboard") return pathname === "/admin/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

// Категория, к которой относится текущий путь (по любому из её пунктов).
export function findActiveCategory(pathname: string): AdminNavCategory | undefined {
  return ADMIN_NAV_TREE.find((cat) => cat.items.some((it) => isNavItemActive(pathname, it.href)))
}
