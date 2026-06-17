"use client"

// Левое боковое меню админ-панели. Показывает ТОЛЬКО категории (источник —
// ADMIN_NAV_TREE). Пункты категории живут в горизонтальных табах
// (components/admin/admin-category-tabs.tsx), здесь НЕ дублируются.
// Клик по категории ведёт на её первый пункт. Сворачивается в иконочную полоску.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { ADMIN_NAV_TREE, isNavItemActive } from "@/components/admin/admin-nav-tree"

function isCategoryActive(pathname: string, cat: (typeof ADMIN_NAV_TREE)[number]): boolean {
  return cat.items.some((it) => isNavItemActive(pathname, it.href))
}

export function AdminNav() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Восстанавливаем состояние сворачивания из localStorage.
  useEffect(() => {
    setCollapsed(localStorage.getItem("admin-nav-collapsed") === "1")
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem("admin-nav-collapsed", next ? "1" : "0") } catch {}
      return next
    })
  }

  return (
    <nav
      className={cn(
        "shrink-0 border-r border-border bg-background py-3 overflow-y-auto overflow-x-hidden transition-[width] duration-200",
        collapsed ? "w-14" : "w-52",
      )}
    >
      {/* Кнопка сворачивания */}
      <div className={cn("flex mb-2", collapsed ? "justify-center" : "justify-end px-3")}>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <div className="space-y-0.5">
        {ADMIN_NAV_TREE.map((cat) => {
          const active = isCategoryActive(pathname, cat)
          return (
            <Link
              key={cat.title}
              href={cat.items[0].href}
              title={collapsed ? cat.title : undefined}
              className={cn(
                "flex items-center gap-2.5 mx-2 px-2 py-2 rounded-md text-sm transition-colors",
                collapsed && "justify-center mx-1.5 px-0",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <cat.icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "")} />
              {!collapsed && <span className="truncate">{cat.title}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
