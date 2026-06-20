"use client"

// Левое боковое меню админ-панели. Источник — ADMIN_NAV_TREE. Большинство пунктов
// — прямые ссылки; многопунктовые категории раскрываются горизонтальными табами
// (admin-category-tabs.tsx).
//
// «Умное» сворачивание: кнопка-замок фиксирует свёрнутый (иконки) / развёрнутый вид
// (localStorage). Когда зафиксировано свёрнуто — при наведении мышью меню
// автоматически РАЗВОРАЧИВАЕТСЯ оверлеем (поверх контента, без сдвига вёрстки),
// а при уходе курсора схлопывается обратно.

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
  const [hovered, setHovered] = useState(false)

  // Восстанавливаем состояние сворачивания из localStorage.
  useEffect(() => {
    setCollapsed(localStorage.getItem("admin-nav-collapsed") === "1")
  }, [])

  function toggle() {
    // Кнопка-замок внутри nav → курсор остаётся над меню после клика. Без сброса
    // hovered клик «не виден»: expanded=!collapsed||hovered оставался true, меню не
    // схлопывалось, а лишь становилось оверлеем, из-под которого уезжал контент.
    // Сбрасываем hovered, чтобы клик схлопывал/разворачивал сразу; разворот по
    // наведению вернётся на следующем mouse-enter.
    setHovered(false)
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem("admin-nav-collapsed", next ? "1" : "0") } catch {}
      return next
    })
  }

  // Развёрнутый вид: либо зафиксирован, либо временно по наведению (при свёрнутом).
  const expanded = !collapsed || hovered

  return (
    // Обёртка тянет ширину под expanded: при разворачивании (клик ИЛИ наведение)
    // меню раздвигает контент вправо in-flow — как сайдбар сайта, — а НЕ ложится
    // оверлеем поверх (иначе раскрытое меню перекрывало левую часть таблицы).
    // Hover-обработчики — на обёртке: она всегда равна ширине nav (оверлея нет),
    // поэтому курсор не выходит за её пределы при разворачивании → без мерцания.
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("relative shrink-0 transition-[width] duration-200", expanded ? "w-52" : "w-14")}
    >
      <nav
        className={cn(
          "h-full border-r border-border bg-background py-3 overflow-y-auto overflow-x-hidden transition-[width] duration-200",
          expanded ? "w-52" : "w-14",
        )}
      >
        {/* Кнопка фиксации свёрнут/развёрнут */}
        <div className={cn("flex mb-2", expanded ? "justify-end px-3" : "justify-center")}>
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? "Закрепить развёрнутым" : "Свернуть меню"}
            aria-label={collapsed ? "Закрепить развёрнутым" : "Свернуть меню"}
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
                title={!expanded ? cat.title : undefined}
                className={cn(
                  "flex items-center gap-2.5 mx-2 px-2 py-2 rounded-md text-sm transition-colors",
                  !expanded && "justify-center mx-1.5 px-0",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <cat.icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "")} />
                {expanded && <span className="truncate">{cat.title}</span>}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
