"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Хранение пользовательского порядка перетаскиваемых колонок списка кандидатов
 * в localStorage (per-user, per-browser). Закреплённые колонки (чекбокс/звезда/
 * имя слева и «Действия» справа) в этом списке НЕ участвуют — двигаются только
 * средние колонки данных.
 *
 * Возвращает порядок только для тех id, что реально доступны (defaultOrder):
 * сохранённый порядок мёрджится с дефолтом — новые колонки добавляются в конец,
 * исчезнувшие (выключенные настройками или удалённые из кода) — отфильтровываются.
 * Это гарантирует, что переключение showSalary/showSource/showVacancyColumn и
 * добавление новых колонок не ломают сохранённый порядок.
 */
const STORAGE_KEY = "candidate-list-column-order-v1"

function readStored(): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[]
    }
    return null
  } catch {
    return null
  }
}

/** Мёрдж сохранённого порядка с актуальным набором доступных колонок.
 *  Сохранённые id, которых больше нет в defaultOrder, выкидываются;
 *  новые id из defaultOrder, которых нет в сохранённом, дописываются в конец
 *  в их дефолтном относительном порядке. */
function reconcile(stored: string[] | null, defaultOrder: string[]): string[] {
  if (!stored) return defaultOrder
  const allowed = new Set(defaultOrder)
  const kept = stored.filter((id) => allowed.has(id))
  const keptSet = new Set(kept)
  const appended = defaultOrder.filter((id) => !keptSet.has(id))
  return [...kept, ...appended]
}

export function useColumnOrder(defaultOrder: string[]): {
  order: string[]
  setOrder: (next: string[]) => void
  reset: () => void
  isCustom: boolean
} {
  // Первый рендер (и SSR) — всегда дефолт, чтобы не было гидрационного
  // рассогласования. После маунта подтягиваем сохранённый порядок.
  const [stored, setStored] = useState<string[] | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setStored(readStored())
    setHydrated(true)
  }, [])

  const order = hydrated ? reconcile(stored, defaultOrder) : defaultOrder

  const setOrder = useCallback((next: string[]) => {
    setStored(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* localStorage недоступен (private mode и т.п.) — порядок живёт в стейте */
    }
  }, [])

  const reset = useCallback(() => {
    setStored(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* no-op */
    }
  }, [])

  const isCustom = hydrated && stored != null && stored.length > 0

  return { order, setOrder, reset, isCustom }
}
