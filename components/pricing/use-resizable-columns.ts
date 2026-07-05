"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface ResizableColumn {
  id: string
  /** Ширина по умолчанию, px */
  default: number
  /** Минимальная ширина при перетаскивании, px */
  min?: number
}

// Хук ресайза колонок таблицы: тянем правый край заголовка → меняется ширина
// колонки. Ширины сохраняются в localStorage под storageKey (переживают
// перезагрузку). columns может меняться (динамические периоды) — новые id
// получают default.
export function useResizableColumns(storageKey: string, columns: ResizableColumn[]) {
  const columnsRef = useRef(columns)
  columnsRef.current = columns

  const [widths, setWidths] = useState<Record<string, number>>({})

  // Инициализация из дефолтов + localStorage. Пересобираем при изменении набора
  // колонок, не теряя уже применённые/сохранённые ширины.
  useEffect(() => {
    let saved: Record<string, number> = {}
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) saved = JSON.parse(raw)
    } catch {
      saved = {}
    }
    setWidths((prev) => {
      const next: Record<string, number> = {}
      for (const c of columns) {
        next[c.id] = prev[c.id] ?? saved[c.id] ?? c.default
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, columns.map((c) => c.id).join("|")])

  const drag = useRef<{ id: string; startX: number; startW: number; min: number } | null>(null)

  const onResizeStart = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const col = columnsRef.current.find((c) => c.id === id)
      const startW = widths[id] ?? col?.default ?? 120
      drag.current = { id, startX: e.clientX, startW, min: col?.min ?? 60 }

      const onMove = (ev: MouseEvent) => {
        const d = drag.current
        if (!d) return
        const delta = ev.clientX - d.startX
        const nextW = Math.max(d.min, d.startW + delta)
        setWidths((w) => ({ ...w, [d.id]: nextW }))
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        setWidths((w) => {
          try {
            localStorage.setItem(storageKey, JSON.stringify(w))
          } catch {
            /* ignore */
          }
          return w
        })
        drag.current = null
      }

      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [widths, storageKey],
  )

  const totalWidth = columns.reduce((sum, c) => sum + (widths[c.id] ?? c.default), 0)

  return { widths, onResizeStart, totalWidth }
}

// Маленький маркер-«ручка» на правом крае заголовка. Использовать внутри
// TableHead (у которого position: relative).
export const RESIZER_CLASS =
  "absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none touch-none " +
  "hover:bg-primary/40 active:bg-primary/60 transition-colors"
