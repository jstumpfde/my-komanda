"use client"

// Общие хелперы и примитивы для табов хаба /admin/clients
// (Компании / Пользователи / Счета). Только вид/утилиты — функционал у
// каждого таба свой.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight } from "lucide-react"

export const PAGE_SIZES = [20, 50, 100]

// Роли пользователей платформы (единый источник подписей — см. также
// app/(admin)/admin/clients/[id]/page.tsx).
export const ROLE_LABELS: Record<string, string> = {
  director:         "Директор",
  hr_lead:          "Главный HR",
  hr_manager:       "HR-менеджер",
  department_head:  "Рук. отдела",
  observer:         "Наблюдатель",
  platform_admin:   "Адм. платформы",
  platform_manager: "Менеджер платформы",
  admin:            "Администратор",
  manager:          "Менеджер",
}

// Роли, доступные для назначения клиентскому пользователю.
export const CLIENT_ROLES = ["director", "hr_lead", "hr_manager", "department_head", "observer"]

export function formatPrice(price: number | null | undefined) {
  if (price === null || price === undefined) return "—"
  return price.toLocaleString("ru-RU") + " ₽"
}

export function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("ru-RU")
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// Единый футер таблицы: «Показано N из M» + пагинация + выбор размера страницы.
export function TableFooter({
  shown, total, page, totalPages, loading, pageSize, onPage, onPageSize, emptyText = "Нет данных",
}: {
  shown: number
  total: number
  page: number
  totalPages: number
  loading: boolean
  pageSize: number
  onPage: (updater: (p: number) => number) => void
  onPageSize: (n: number) => void
  emptyText?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `Показано ${shown} из ${total}` : emptyText}
      </p>
      <div className="flex items-center gap-4 flex-wrap">
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(p => p - 1)} className="gap-1">
              <ChevronLeft className="w-4 h-4" />Назад
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
              if (p < 1 || p > totalPages) return null
              return (
                <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => onPage(() => p)}>{p}</Button>
              )
            })}
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => onPage(p => p + 1)} className="gap-1">
              Вперёд<ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">По:</Label>
          <Select value={String(pageSize)} onValueChange={v => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[76px]"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">на стр.</span>
        </div>
      </div>
    </div>
  )
}
