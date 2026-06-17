"use client"

// Хлебные крошки админ-панели. Строятся из pathname по словарю меток.
// Динамические сегменты (UUID) показываются как «Карточка».

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

const LABELS: Record<string, string> = {
  dashboard:    "Дашборд",
  clients:      "Компании",
  requests:     "Запросы на email",
  integrators:  "Партнёры",
  levels:       "Уровни комиссии",
  plans:        "Тарифные планы",
  tariffs:      "Тарифы",
  roles:        "Роли и доступ",
  platform:     "Платформа",
  companies:    "Компании (AI)",
  vacancies:    "AI вакансии",
  templates:    "Шаблоны воронок",
  yulia:        "Юлия",
  cron:         "Cron-запуски",
  deadlines:    "Сроки / health",
  emergency:    "Emergency",
  logs:         "Логи действий",
  presence:     "Присутствие",
  branding:     "Брендинг и SEO",
  migrations:   "Миграции",
  demo:         "Демо-данные",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Crumb {
  label: string
  href: string | null
}

function buildCrumbs(pathname: string): Crumb[] {
  // /admin/clients/<id> → ["admin","clients","<id>"]
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "admin") return []

  const crumbs: Crumb[] = [{ label: "Админка", href: "/admin/dashboard" }]
  let acc = "/admin"
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i]
    acc += `/${seg}`
    // «platform» — служебный префикс, не отдельная страница: пропускаем как ссылку.
    if (seg === "platform") {
      crumbs.push({ label: "Платформа", href: null })
      continue
    }
    const label = UUID_RE.test(seg) ? "Карточка" : (LABELS[seg] ?? seg)
    crumbs.push({ label, href: acc })
  }
  return crumbs
}

export function AdminBreadcrumbs() {
  const pathname = usePathname()
  const crumbs = buildCrumbs(pathname)
  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-1 px-6 py-2 text-xs text-muted-foreground border-b border-border/60 bg-background/50">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
            {last || !c.href ? (
              <span className={last ? "text-foreground font-medium" : ""}>{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-foreground transition-colors">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
