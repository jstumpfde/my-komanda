"use client"

// Горизонтальные табы пунктов текущей категории админ-панели (как на «Рабочем
// столе»). Источник — ADMIN_NAV_TREE. Категорию определяем по текущему пути.
// Если в категории один пункт (Дашборд/Тарифы) — табы не показываем.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { findActiveCategory, isNavItemActive } from "@/components/admin/admin-nav-tree"

export function AdminCategoryTabs() {
  const pathname = usePathname()
  const category = findActiveCategory(pathname)

  if (!category || category.items.length <= 1) return null

  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-center gap-1 px-4 overflow-x-auto">
        {category.items.map((item) => {
          const active = isNavItemActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
